---
title: "Azure 하이브리드 클라우드 인프라 구축"
date: 2026-05-19 00:00:00 +0900
categories: [Project, Azure]
tags: [azure, terraform, hub-spoke, ipsec-vpn, disaster-recovery, waf, redis, iac]
---

## 1. 프로젝트 개요

온프레미스에서 운영되던 웹 서비스를 Azure로 확장·이관하여, 무중단 고가용성과 재해복구(DR) 역량을 갖춘 하이브리드 클라우드 인프라를 구축한 프로젝트입니다. 단일 리전에서 시작해 다중 리전 이중화, 자동 확장, 하이브리드 연동까지 단계적으로 확장하는 방식을 택해, 각 단계마다 검증 가능한 산출물을 확보하고 위험을 분산했습니다.

애플리케이션은 WordPress 7.0(ko_KR) 기반 WooCommerce 쇼핑몰로 구성했고, 데이터베이스는 보안 정책상 온프레미스에 잔류시킨 뒤 Site-to-Site IPsec VPN으로 Azure와 연동하는 하이브리드 데이터 구조를 적용했습니다. 전체 인프라는 Terraform으로 코드화했습니다.

**핵심 목표**

- **고가용성(HA)** : VMSS + Application Gateway 자동 확장, 가용 영역(Zone) 분산으로 SPOF 제거
- **재해복구(DR)** : Korea Central · Japan East 두 리전에 동일 스택 배포, Traffic Manager 우선순위 라우팅으로 리전 장애 시 자동 페일오버
- **제로 트러스트 보안** : Hub-Spoke 망 분리, Azure Firewall 중앙 집중 제어, Application Gateway WAF, Private Endpoint 기반 PaaS 격리
- **하이브리드 연동** : 온프레미스 MySQL을 IPsec VPN으로 안전하게 연동해 데이터 주권 유지
- **인프라 자동화(IaC)** : Terraform으로 전체 인프라를 코드화하여 일관성·재현성 확보

<br>

**사용 기술 및 버전**

| 구분 | 기술 / 버전 | 비고 |
|------|-------------|------|
| IaC 도구 | Terraform (azurerm 4.74.0) | 버전 고정으로 일관성 확보 |
| VM OS | Rocky Linux 9 | publisher: resf |
| VM 규격 | Standard_B1s | 비용 최적화 |
| 웹 애플리케이션 | WordPress 7.0 (ko_KR) | WooCommerce · 커스텀 쇼핑 페이지 |
| 캐시 계층 | Azure Managed Redis (Balanced_B1) | TLS · 포트 10000 |
| 데이터베이스 | 온프레미스 MySQL | VPN 연동 |
| 주 / DR 리전 | Korea Central / Japan East | DR은 AZ 여건상 Japan East 채택 |

> **DR 리전 선정** — Korea South는 가용 영역(Availability Zone)을 제공하지 않아 Zone 분산 HA 구성이 불가능합니다. 그래서 AZ를 지원하는 Japan East를 DR 리전으로 채택해, 두 리전 모두 Zone-redundant 구성을 일관되게 적용했습니다.

<br>

---

<br>

## 2. 단계별 확장 아키텍처

인프라를 한 번에 만들지 않고 두 국면으로 나눠 단계적으로 구축했습니다. 단일 리전 구축기(1~3단계)에서는 Korea Central 안에서 기본 웹 서비스부터 Hub-Spoke 망 분리, 보안 계층까지 완성했고, 다중 리전 확장기(4~5단계)에서 Japan East를 추가해 DR · 하이브리드 연동 · 성능 최적화를 구현했습니다.

| 단계 | 핵심 추가 구성 | 목표 |
|------|----------------|------|
| 1단계 | VNet, AppGW, VM, Bastion, PE, 스토리지 | 단일 리전 기본 웹 서비스 |
| 2단계 | Hub-Spoke 망 분리 · Peering | 네트워크 격리·확장성 확보 |
| 3단계 | VMSS 자동 확장, WAF, Redis, Private Endpoint, Monitor | 단일 리전 서비스 계층 강화 |
| 4단계 | Japan East 추가, Azure Firewall·UDR, VPN Gateway(IPsec) | 다중 리전 DR·하이브리드 연동 |
| 5단계 | Traffic Manager, Azure Files 공유, 통합 모니터링 | 자동 절체·성능·운영 최적화 |

![전체 아키텍처 구성도](/assets/images/project/azure-hybrid-cloud/architecture.png)
_최종 5단계 전체 구성도 — 다중 리전 Hub-Spoke · DR · IPsec VPN_

![Azure Portal 리소스 맵](/assets/images/project/azure-hybrid-cloud/portal-resource-map.png)
_Azure Portal 리소스 그룹 토폴로지 (실제 배포된 리소스 구성)_

<br>

---

<br>

## 3. 네트워크 설계

최종 형상은 두 리전 각각에 Hub VNet과 Spoke VNet을 두고 리전 내부에서 Peering으로 연결하는 Hub-Spoke 구조입니다. Hub에는 Azure Firewall · Application Gateway · VPN Gateway 등 공유·경계 서비스를, Spoke에는 워크로드(VMSS)와 Private Endpoint를 배치했습니다.

| 리전 | VNet | 대역 | 주요 서브넷 |
|------|------|------|-------------|
| Korea Central | central-hub-vnet | 10.0.0.0/16 | AzureFirewallSubnet, AppGW-Subnet, GatewaySubnet |
| Korea Central | central-spoke-vnet | 10.1.0.0/16 | AzureBastionSubnet, Web-Subnet, PE-Subnet |
| Japan East | japan-hub-vnet | 10.2.0.0/16 | AzureFirewallSubnet, AppGW-Subnet, GatewaySubnet |
| Japan East | japan-spoke-vnet | 10.3.0.0/16 | AzureBastionSubnet, Web-Subnet, PE-Subnet |
| 온프레미스 | Bluemax NGF 100 | 내부 서버팜 | MySQL |

> **대역 충돌 검증** — 네 개 VNet 대역(10.0/16 ~ 10.3/16)과 온프레미스 대역은 상호 겹치지 않으며, 모든 서브넷은 상위 VNet 범위 안에 포함되도록 설계했습니다. `GatewaySubnet`과 `AzureBastionSubnet`은 Azure가 강제하는 고정 이름과 최소 /26 크기 요건을 충족합니다. Web · PE 서브넷은 `default_outbound_access_enabled = false`로 불필요한 인터넷 노출을 차단했습니다.

![Central Hub-Spoke VNet Peering 상태](/assets/images/project/azure-hybrid-cloud/peering-central.png)
_Central Hub ↔ Spoke VNet Peering 연결 상태_

<br>

---

<br>

## 4. 보안 계층 (Zero-Trust)

### 4.1 Azure Firewall + UDR 중앙 집중 제어

Hub의 `AzureFirewallSubnet`에 Azure Firewall(Standard)을 배치하고, Spoke의 Web-Subnet · PE-Subnet에 UDR(사용자 지정 라우팅)을 적용해 모든 아웃바운드 트래픽이 강제로 Firewall을 경유하도록 구성했습니다. Firewall 정책은 웹 서버에서 온프레미스 MySQL(3306)로의 통신과 Spoke 대역의 80/443 아웃바운드만 허용합니다.

| 라우트 테이블 | 0.0.0.0/0 경로 | 온프레미스 경로 | 적용 서브넷 |
|---------------|----------------|------------------|-------------|
| central-web-rt | VirtualAppliance (Firewall) | → VNet GW | Central Web-Subnet |
| central-pe-rt | VirtualAppliance (Firewall) | 없음(정상) | Central PE-Subnet |
| japan-web-rt | VirtualAppliance (Firewall) | → VNet GW | Japan Web-Subnet |
| japan-pe-rt | VirtualAppliance (Firewall) | 없음(정상) | Japan PE-Subnet |

> **비대칭 라우팅 회피** — Application Gateway는 v2 SKU 특성상 공인 IP로 직접 인바운드를 수신해야 하므로 AppGW-Subnet에는 UDR을 적용하지 않았습니다. PE-Subnet에도 온프레미스 경로를 두지 않아, Private Endpoint 응답 트래픽이 불필요하게 VPN 게이트웨이로 향하지 않도록 했습니다. 이 두 가지를 놓치면 AppGW 관리 트래픽 장애나 비대칭 라우팅이 발생합니다.

### 4.2 Application Gateway WAF

Application Gateway를 WAF_v2 SKU로 구성하고 OWASP 3.2 룰셋을 **Prevention 모드**로 적용해, SQL Injection 등 L7 공격을 실시간 차단합니다.

### 4.3 Private Endpoint 기반 PaaS 격리

스토리지(File)와 Redis는 공인 접근을 차단하고 Spoke의 PE-Subnet에 Private Endpoint로 연결했습니다. 각 PaaS에 대응하는 Private DNS Zone을 구성하고 4개 VNet에 모두 링크해, 내부에서 사설 IP로 이름 풀이가 되도록 했습니다.

| PaaS 서비스 | Private DNS Zone |
|-------------|------------------|
| Storage (File) | privatelink.file.core.windows.net |
| Managed Redis | privatelink.redis.azure.net |

> **Redis DNS Zone 주의** — 신형 Azure Managed Redis는 `privatelink.redis.azure.net` 영역을 사용합니다. 구형 Azure Cache for Redis용 `privatelink.redis.cache.windows.net`을 쓰면 PE 격리가 동작하지 않고 공인 IP가 반환되므로 반드시 구분해야 합니다.

<br>

---

<br>

## 5. 하이브리드 연동 (IPsec VPN)

양 리전의 VPN Gateway(VpnGw1AZ, RouteBased)와 온프레미스 Bluemax NGF 100 방화벽 사이에 Site-to-Site IPsec 터널을 수립했습니다. 핵심은 양 끝단의 IPsec/IKE 정책을 정확히 일치시키는 것입니다 — 하나라도 어긋나면 터널이 성립하지 않습니다.

온프레미스 Bluemax NGF 100의 지점 연결(고급 설정) 값은 다음과 같으며, Azure VPN Gateway 측 IPsec 정책과 동일하게 맞췄습니다.

| 파라미터 | 값 |
|----------|-----|
| 연결 모드 | IKEv2 |
| 보안 정책 (암호화 / 무결성 / DH) | AES-256 / SHA-256 / DHGroup14 |
| 동작 모드 | ESP-Tunnel |
| IKE SA 수명 | 28800초 |
| IPSec SA 수명 | 27000초 |
| IKE 포트 | UDP 500 |
| PFS | None |
| UDP Encapsulation | 미적용(OFF) |
| 표준 IPSec | 적용(ON) |
| 보안 연결 동작 방식 | Active |
| 확장 모드 | ON |
| 센터(원격) 구분 | 외부망 |

> **NAT 제외** — VPN 터널 트래픽 구간에는 NAT를 적용하지 않았습니다. 해당 구간은 IPsec이 처리하므로 SNAT/DNAT가 개입하면 응답 패킷이 디폴트 게이트웨이로 유출되어 터널이 끊깁니다. 또한 VpnGw1은 deprecated되어 가용 영역을 지원하는 VpnGw1AZ SKU를 채택했습니다.

방화벽 보안 정책은 화이트리스트 방식으로 구성했습니다. 웹 서버 ↔ MySQL 통신만 허용하고, 그 외 MySQL 접근과 전체 트래픽은 기본 차단합니다.

| 출발지 | 목적지 | 서비스 | 동작 |
|--------|--------|--------|------|
| 10.1.0.0/16 (Azure 웹) | 10.10.34.119 (MySQL) | MySQL | 허용 |
| 10.10.34.119 | 10.1.0.0/16 | MySQL | 허용 |
| Any | 10.10.34.119 | MySQL | 거부 |
| 10.10.34.0/24 | Any | Any | 허용 |
| Any | Any | Any | 거부 (기본) |

<br>

---

<br>

## 6. 재해복구 — Traffic Manager Failover

우선순위(Priority) 라우팅으로 Central(우선순위 1, Active) · Japan(우선순위 2, Standby) 엔드포인트를 구성했습니다. HTTP 상태 프로브(30초 간격)로 Central 장애를 감지하면 Japan East로 DNS를 전환합니다.

- 정상 상태에서 도메인 조회 시 **Central AppGW IP** 반환
- `central-endpoint` 비활성화 시 `japan-endpoint`가 Online으로 전환되고, 조회 결과가 **Japan AppGW IP**로 전환
- DB가 온프레미스 단일 인스턴스에 잔류하므로, 어느 리전에서 접속하더라도 동일 데이터가 보장되어 페일오버가 데이터 정합성에 영향을 주지 않음

![정상 운영 — Central IP 반환](/assets/images/project/azure-hybrid-cloud/dr-normal-central.png)
_정상 운영 시 Traffic Manager가 Central AppGW로 라우팅_

![Failover 후 — Japan IP 반환](/assets/images/project/azure-hybrid-cloud/dr-failover-japan.png)
_Central 비활성화 시 Japan East로 DNS 전환_

<br>

---

<br>

## 7. 성능 및 운영 최적화

- **Redis 캐시** : Azure Managed Redis(Balanced_B1)를 양 리전에 배치, PE로 격리(공인 접근 차단), WordPress Redis Object Cache 플러그인 연동(TLS · 10000)
- **Azure Files 공유** : `wp-content/uploads`를 SMB로 마운트해 VMSS 인스턴스 간 업로드 파일 공유. 스케일아웃으로 생성되는 인스턴스도 동일 볼륨을 마운트
- **통합 모니터링** : 리전별 Log Analytics Workspace(보존 30일)에서 VMSS · AppGW · Firewall 로그·메트릭 수집

> **스토리지 분리 결정** — Central/Japan PE를 동일 스토리지 계정에 연결하면 DNS A-record가 충돌합니다. 그래서 리전별 별도 계정으로 분리했습니다. 주 리전(Central)은 데이터 내구성을 위해 GRS, DR 리전(Japan)은 페일오버 시 로컬 캐시·미디어 용도이므로 비용 효율적인 LRS 전용 계정을 운영합니다.

<br>

---

<br>

## 8. IaC 구성

전체 인프라를 azurerm 4.74.0 Provider 기반 **22개 Terraform 파일**로 모듈화했습니다. 파일에 기능별 번호를 부여해 의존 순서와 가독성을 확보했습니다(00_init → 01_rg → 02_vnet → … → 20_trafficmanager). VMSS는 별도 골든 이미지 없이 `custom_data`로 `install.sh.tpl`을 주입해, 부팅 시점에 패키지 설치 · WordPress 배치 · DB 연결 · Files 마운트 · Redis 연동 전 과정을 자동화합니다.

![Azure Portal 구성 완료](/assets/images/project/azure-hybrid-cloud/portal-japan-complete.png)
_Azure Portal 리소스 구성 완료 (Japan East)_

<br>

---

<br>

## 9. 검증 결과

배포된 인프라가 설계 의도대로 동작하는지 8개 영역으로 나눠 검증했습니다.

| 영역 | 검증 내용 | 상태 |
|------|-----------|:----:|
| 보안 | 공인IP 제거 · Firewall 경유 · WAF 차단 · 외부 DB 차단 | 완료 |
| 네트워크 | Hub-Spoke · VNet Peering | 완료 |
| 고가용성 | 인스턴스 장애 시 서비스 지속 · CPU 기반 Auto Scaling | 완료 |
| 하이브리드 | VPN · 온프레미스 DB 연동 | 완료 |
| 캐시 계층 | Redis PE DNS 격리 · WordPress 연동(Connected) | 완료 |
| 재해복구 | 정상 운영 · Japan 페일오버 · 데이터 일관성 | 완료 |
| 공유 스토리지 | Azure Files 인스턴스 간 공유 | 완료 |
| 모니터링 | Log Analytics 로그 수집 | 완료 |

**대표 검증**

- **Firewall 강제 경유** : VMSS에서 `curl ifconfig.me` 실행 시 Firewall 공인 IP가 반환되어, 모든 아웃바운드가 UDR을 통해 Firewall을 경유함을 확인
- **WAF 차단** : 정상 요청은 200 OK, SQL Injection 시도는 403 Forbidden으로 차단
- **Auto Scaling** : `yes` 명령으로 CPU ~99% 부하를 발생시켜 threshold 70% 초과 시 인스턴스가 2대 → 5대로 자동 확장
- **Redis PE 격리** : `nslookup` 시 `privatelink.redis.azure.net` CNAME으로 사설 IP가 반환됨을 확인

![Firewall 강제 경유 확인](/assets/images/project/azure-hybrid-cloud/verify-firewall-egress.png)
_VMSS curl ifconfig.me → Firewall 공인 IP 반환 (UDR 강제 경유)_

![WAF SQL Injection 차단](/assets/images/project/azure-hybrid-cloud/verify-waf-403.png)
_SQL Injection 시도 → 403 Forbidden (WAF 차단)_

![CPU 기반 Auto Scaling](/assets/images/project/azure-hybrid-cloud/verify-autoscale.png)
_CPU 70% 초과 시 2대 → 5대 자동 스케일아웃_

![Redis Private Endpoint 격리](/assets/images/project/azure-hybrid-cloud/verify-redis-pe.png)
_nslookup → privatelink.redis.azure.net 사설 IP 반환_

<br>

---

<br>

## 10. 한계점 및 개선 방향

| 항목 | 현황 | 개선 방향 |
|------|------|-----------|
| HTTPS 미적용 | AppGW 리스너 80(HTTP) | 443 리스너·인증서, Key Vault 연동 SSL 종단 |
| VPN 단일 터널 (SPOF) | VPN GW·Bluemax·ISP 단일 경로 | Active-Active VPN, 회선 이중화, ExpressRoute |
| 비밀번호 평문 | tfvars·install.sh 평문 저장 | Key Vault + Managed Identity |
| Traffic Manager 절체 지연 | DNS 기반이라 TTL만큼 지연 | Front Door(L7) 도입으로 즉시 절체 |
| CI/CD 부재 | Terraform 수동 apply | 파이프라인 구축으로 자동 배포 |

<br>

## 마무리

단일 리전에서 다중 리전 DR · 하이브리드 연동까지 확장했고, 배포 결과를 보안 · 네트워크 · 고가용성 · 하이브리드 · 캐시 · 재해복구 · 공유 스토리지 · 모니터링 8개 영역에서 검증했습니다.

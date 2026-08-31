---
title: "Azure 클라우드 인프라 및 M365 Defender 보안구축"
date: 2026-05-19 00:00:00 +0900
categories: [Project, Azure]
tags: [Azure, terraform, HubSpoke, IPsecVPN, DisasterRecovery, waf, redis, IaC]
---

## 1. 개요

온프레미스에서 운영되던 웹 서비스를 Azure로 확장·이관하여, 무중단 고가용성과 재해복구(DR)를 갖춘 클라우드 인프라를 구축한 프로젝트입니다. 단일 리전에서 시작해 다중 리전 이중화 → 자동 확장 → 하이브리드 연동까지 단계적으로 확장했으며, 전체 인프라를 Terraform(IaC)으로 코드화했습니다.

애플리케이션은 WordPress·WooCommerce 쇼핑몰이고, 데이터베이스는 보안 정책상 온프레미스에 유지한 뒤 Site-to-Site IPsec VPN으로 Azure와 연동했습니다. 배포된 인프라는 보안·네트워크·고가용성·하이브리드·캐시·재해복구·공유 스토리지·모니터링 8개 영역으로 나누어 실제 동작을 검증했습니다.

**기술 스택**

`Terraform (azurerm 4.74)` · `Azure VMSS / Application Gateway WAF / Azure Firewall` · `Traffic Manager` · `Azure Managed Redis` · `Azure Files` · `VPN Gateway (IPsec)` · `Rocky Linux 9` · `WordPress · WooCommerce`

**기간** 2026.5.13 ~ 5.19 (7일)

<br>

---

<br>

## 2. 아키텍처

두 리전(Korea Central·Japan East)에 동일한 **Hub-Spoke** 스택을 대칭 배포하고, 리전 내부는 VNet Peering으로 연결했습니다. Hub에는 Azure Firewall·Application Gateway·VPN Gateway 같은 공유·경계 서비스를, Spoke에는 워크로드(VMSS)와 Private Endpoint를 배치했습니다. 온프레미스 MySQL은 IPsec VPN으로 연동하고, Traffic Manager가 리전 장애 시 자동으로 절체합니다.

> **DR 리전 선정** — Korea South는 가용 영역(Availability Zone)을 지원하지 않아 Zone 분산 HA 구성이 불가능합니다. AZ를 지원하는 Japan East를 DR 리전으로 채택해 두 리전 모두 Zone-redundant로 구성했습니다.

![전체 아키텍처 구성도](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/architecture.png)
_다중 리전 Hub-Spoke · DR · IPsec VPN 전체 구성_

![Azure Portal 리소스 맵](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/portal-resource-map.png)
_실제 배포된 리소스 토폴로지_

<br>

---

<br>

## 3. 네트워크 설계

두 리전 각각에 Hub VNet(10.0/10.2 대역)과 Spoke VNet(10.1/10.3 대역)을 두고 리전 내부에서 Peering으로 연결했습니다. Hub에는 `AzureFirewallSubnet`·`AppGW-Subnet`·`GatewaySubnet`을, Spoke에는 `AzureBastionSubnet`·`Web-Subnet`·`PE-Subnet`을 배치했습니다. 4개 VNet 대역과 온프레미스(10.10.34.0/24)는 서로 겹치지 않으며, `GatewaySubnet`·`AzureBastionSubnet`은 Azure 강제 이름과 최소 /26 크기 요건을 충족합니다. Web·PE 서브넷은 불필요한 인터넷 노출을 막기 위해 기본 아웃바운드 접근을 비활성화했습니다.

Hub-Spoke Peering에는 Gateway Transit을 활성화해, Spoke가 Hub의 VPN Gateway를 공유하여 온프레미스와 통신하고 DR 시에도 연결이 유지되도록 했습니다.

<br>

---

<br>

## 4. 보안 (Zero-Trust)

**Azure Firewall + UDR 중앙 집중 제어** — Hub에 Azure Firewall을 배치하고 Spoke의 Web·PE 서브넷에 UDR(사용자 지정 라우팅)을 적용해, 모든 아웃바운드 트래픽이 강제로 Firewall을 경유하도록 했습니다. Firewall은 웹 서버 → 온프레미스 MySQL 통신과 필요한 80/443 아웃바운드만 허용합니다.

> **비대칭 라우팅 회피** — Application Gateway v2는 공인 IP로 직접 인바운드를 받아야 하므로 AppGW 서브넷에는 UDR을 적용하지 않았습니다. PE 서브넷에도 온프레미스 경로를 두지 않아, Private Endpoint 응답 트래픽이 불필요하게 VPN 게이트웨이로 향하지 않도록 했습니다.

**Application Gateway WAF** — WAF_v2에 OWASP 3.2 룰셋을 Prevention 모드로 적용해 SQL Injection 등 L7 공격을 입구에서 차단합니다.

**Private Endpoint 격리** — 스토리지(File)와 Redis를 공인망에서 차단하고 Spoke의 PE 서브넷에 Private Endpoint로 연결했습니다. 각 PaaS에 대응하는 Private DNS Zone을 4개 VNet 전체에 링크해 내부에서 사설 IP로 이름이 풀리도록 했습니다.

> **Redis DNS Zone 주의** — 신형 Azure Managed Redis는 `privatelink.redis.azure.net` 영역을 사용합니다. 구형(`redis.cache.windows.net`) 영역을 쓰면 PE 격리가 동작하지 않고 공인 IP가 반환됩니다.

**Bastion** — VMSS에 공인 IP를 할당하지 않고 Bastion으로 브라우저 기반 원격 접속만 제공해, 외부에서 직접 SSH 포트로 접근할 수 없게 했습니다. 서브넷·NIC에는 NSG로 화이트리스트 규칙을 적용했습니다.

<br>

---

<br>

## 5. 하이브리드 연동 (IPsec VPN)

양 리전의 VPN Gateway(VpnGw1AZ, RouteBased)와 온프레미스 Bluemax NGF 100 방화벽 사이에 Site-to-Site IPsec 터널을 수립했습니다. 양 끝단의 IPsec/IKE 정책(IKEv2·AES-256·SHA-256·DHGroup14·PFS None·SA 27000초)을 동일하게 맞춰야 터널이 성립합니다. VPN 터널 구간에는 NAT를 적용하지 않았는데, IPsec이 처리하는 구간에 SNAT/DNAT가 개입하면 응답 패킷이 디폴트 게이트웨이로 유출되어 터널이 끊기기 때문입니다. 또한 deprecated된 VpnGw1 대신 가용 영역을 지원하는 VpnGw1AZ SKU를 채택했습니다.

<br>

---

<br>

## 6. 재해복구 · 성능 · 운영

**재해복구 (Traffic Manager)** — 우선순위 라우팅으로 Central(우선순위 1, Active)·Japan(우선순위 2, Standby) 엔드포인트를 구성했습니다. Central 장애 시 프로브 실패를 감지해 Japan East로 DNS를 전환합니다. DB가 온프레미스 단일 인스턴스에 있으므로 어느 리전에서 접속해도 데이터가 동일하게 유지됩니다.

**캐시 (Redis)** — Azure Managed Redis를 WordPress 객체 캐시로 붙여 DB 부하를 줄였고, Private Endpoint로 격리했습니다.

**공유 스토리지 (Azure Files)** — `wp-content/uploads`를 Azure Files(SMB)로 마운트해 VMSS 인스턴스 간 업로드 미디어를 공유했습니다. 단일 스토리지 계정에 복수 리전 PE를 연결하면 Private DNS A-record가 충돌하므로, Central(GRS)·Japan(LRS)으로 계정을 분리했습니다.

**모니터링** — 리전별 Log Analytics Workspace로 VMSS·Application Gateway·Firewall 로그와 메트릭을 수집했습니다.

<br>

---

<br>

## 7. Terraform 구성

전체 인프라를 azurerm 4.74.0 기반 22개 Terraform 파일로 모듈화했습니다. 파일에 기능별 번호를 부여해 의존 순서와 가독성을 확보했고(00_init ~ 20_trafficmanager), Provider 버전을 고정해 일관성을 확보했습니다. VMSS는 별도 골든 이미지 없이 `custom_data`(cloud-init)로 부팅 시점에 WordPress 설치·온프레미스 DB 연결·Azure Files 마운트·Redis 연동을 자동 수행하도록 했습니다. VPN PSK 등 민감 값은 `sensitive = true`로 지정해 로그 노출을 방지했습니다.

<br>

---

<br>

## 8. 구축 검증

배포된 인프라가 설계대로 동작하는지 8개 영역으로 나누어 검증했습니다.

### 8.1 보안 (Zero-Trust · Firewall · WAF)

VMSS에 공인 IP를 할당하지 않아 외부에서 직접 접근할 수 없고, VMSS에서 `curl ifconfig.me` 실행 시 Firewall 공인 IP(20.214.183.226)가 반환되어 모든 아웃바운드가 UDR을 통해 Firewall을 강제 경유함을 확인했습니다.

![VMSS 공인 IP 미할당](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/vmss-no-pubip.png)
_VMSS 인스턴스 공인 IP 미할당 확인_

![Firewall 강제 경유](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/firewall-egress.png)
_VMSS curl ifconfig.me → 20.214.183.226 (Firewall 경유)_

외부 인터넷에서 온프레미스 DB 공인 경로(1.220.76.2:3306)로 접근을 시도하면 차단되어, DB 포트가 외부에 노출되지 않음을 확인했습니다.

![외부 DB 접근 차단](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/ext-db-blocked.png)
_외부에서 1.220.76.2:3306 접근 차단 (TcpTestSucceeded: False)_

WAF(OWASP 3.2, Prevention)에서 정상 요청은 200 OK, SQL Injection 시도는 403 Forbidden으로 차단됩니다.

![정상 요청 200 OK](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/http-200.png)
_정상 요청 → HTTP 200 OK_

![WAF SQL Injection 차단](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/waf-403.png)
_SQL Injection(`?id=1 OR 1=1`) 시도 → 403 Forbidden (WAF 차단)_

### 8.2 네트워크 (Hub-Spoke Peering)

각 리전에서 Hub와 Spoke가 Peering으로 연결되어 정상 통신함을 확인했습니다.

![Central Peering](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/peering-central.png)
_Central Hub ↔ Spoke VNet Peering 연결_

![Japan Peering](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/peering-japan.png)
_Japan Hub ↔ Spoke VNet Peering 연결_

### 8.3 고가용성 · Auto Scaling

VMSS 2대 운영 중 1대를 중지(할당 취소)한 상태에서도 쇼핑몰이 정상 접속되어 단일 인스턴스 장애에 대한 서비스 연속성을 확인했습니다.

![1대 중지 후 서비스 정상](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/ha-1down.png)
_인스턴스 1대 중지 상태에서도 쇼핑몰 정상 접속_

`yes` 명령으로 CPU 부하(~99%)를 발생시켜 threshold 70%를 초과시키자, 오토스케일이 트리거되어 인스턴스가 2대에서 5대로 자동 확장됐습니다.

![CPU 99% 부하](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/cpu-99.png)
_yes 프로세스로 CPU ~99% (threshold 70% 초과)_

![오토스케일 2→5대](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/autoscale-2to5.png)
_2대 → 5대 자동 스케일아웃 완료_

### 8.4 하이브리드 (VPN · 온프레미스 DB)

Site-to-Site VPN이 Connected 상태이고, VMSS(10.1.1.x)에서 온프레미스 MySQL(10.10.34.119:3306)로 정상 연동됨을 확인했습니다.

![VPN Connected](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/vpn-connected.png)
_VPN 연결 상태 (Connected)_

![MySQL 연동](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/mysql-linked.png)
_VMSS → 온프레미스 MySQL(10.10.34.119:3306) 연동_

### 8.5 캐시 (Redis PE 격리)

VMSS에서 `nslookup` 시 Redis가 `privatelink.redis.azure.net`으로 CNAME 풀이되고 사설 IP(10.1.2.5)를 반환하여 Private Endpoint 격리가 정상 동작함을 확인했습니다.

![Redis nslookup](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/redis-nslookup.png)
_nslookup → 사설 IP 10.1.2.5 (PE 격리 정상)_

![WordPress Redis 연동](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/redis-connected.png)
_wp redis status → Status: Connected_

### 8.6 재해복구 (Traffic Manager Failover)

정상 상태에서는 `team601shop2.trafficmanager.net` 조회 시 Central App Gateway IP(20.214.152.240)가 반환됩니다. `central-endpoint`를 비활성화하자 `japan-endpoint`가 Online으로 전환되고, DNS 조회 결과가 Japan App Gateway IP(52.140.213.49)로 전환됐습니다.

![정상 운영 — Central](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/dr-normal-central.png)
_정상 운영 — Central IP(20.214.152.240) 반환_

![엔드포인트 전환](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/dr-endpoint-switch.png)
_central-endpoint Disabled / japan-endpoint Online_

![Failover — Japan](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/dr-failover-japan.png)
_Failover 후 — Japan East IP(52.140.213.49) 반환_

데이터 일관성 검증으로, Central에서 회원가입(test01~03)을 수행한 뒤 온프레미스 MySQL의 `shop_users` 테이블에서 해당 레코드를 확인했습니다.

![Central 회원가입](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/signup-central.png)
_Central에서 test01 회원가입 완료_

![MySQL 데이터 확인](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/mysql-users.png)
_온프레미스 MySQL shop_users에 test01~03 저장 확인_

### 8.7 공유 스토리지 (Azure Files)

인스턴스 A에서 Azure Files에 파일을 업로드한 뒤 인스턴스 B에서 동일 파일이 조회되어, 인스턴스 간 미디어 공유가 정상 동작함을 확인했습니다.

![인스턴스 A 업로드](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/files-instanceA.png)
_인스턴스 A — Azure Files 마운트(df) 및 파일 업로드_

![인스턴스 B 조회](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/files-instanceB.png)
_인스턴스 B — 동일 파일 조회 (인스턴스 간 공유 확인)_

### 8.8 모니터링 (Log Analytics)

Log Analytics로 로그·메트릭이 정상 수집됨을 확인했습니다.

![Log Analytics 로그 수집](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/loganalytics.png)
_Log Analytics 로그 수집 확인_

![Redis Cache Hits 메트릭](https://nodoff365.github.io/assets/images/Project/azure-infra-m365-defender/redis-metric.png)
_Azure Monitor — team601-redis Cache Hits 메트릭_

<br>

---

<br>

## 9. 결론

단일 리전에서 다중 리전 DR·하이브리드 연동까지 단계적으로 확장했고, 배포 결과를 보안·네트워크·고가용성·하이브리드·캐시·재해복구·공유 스토리지·모니터링 8개 영역에서 검증했습니다.

**한계 및 개선 방향**

- **HTTPS 미적용** — AppGW 리스너가 HTTP(80). 인증서·Key Vault 연동으로 443 SSL 종단 필요
- **VPN 단일 터널(SPOF)** — Active-Active VPN·회선 이중화 또는 ExpressRoute로 보완
- **시크릿 평문** — tfvars·스크립트 평문 값을 Key Vault + Managed Identity로 관리
- **DNS 기반 절체 지연** — Traffic Manager는 TTL만큼 지연. Front Door(L7)로 즉시 절체 개선
- **CI/CD 부재** — Terraform 수동 apply를 파이프라인으로 자동화

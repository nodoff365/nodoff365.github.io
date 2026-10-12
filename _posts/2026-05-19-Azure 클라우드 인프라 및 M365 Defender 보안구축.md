---
title: "Azure 클라우드 인프라 및 M365 Defender 보안구축"
date: 2026-05-19 00:00:00 +0900
categories: [Project]
tags: [Azure, Terraform, HubSpoke, IPsecVPN, DisasterRecovery, WAF, Redis, IaC]
---

## 프로젝트 기술서

| 항목 | 내용 |
|------|------|
| **프로젝트명** | Azure 클라우드 인프라 및 M365 Defender 보안구축 |
| **수행기간** | 2026.5.13 ~ 5.19 |
| **수행목표** | 온프레미스 웹 서비스를 Azure로 확장·이관하여, 무중단 고가용성과 재해복구(DR)를 갖춘 다중 리전 하이브리드 인프라를 Terraform(IaC)으로 구축 |
| **사용기술** | Terraform(azurerm 4.74) · Azure VMSS · Application Gateway WAF · Azure Firewall · Traffic Manager · Managed Redis · Azure Files · VPN Gateway(IPsec) · Rocky Linux 9 |

<br>

---

<br>

## 1. 프로젝트 개요

온프레미스에서 운영되던 웹 서비스(WordPress·WooCommerce 쇼핑몰)를 Azure로 확장·이관하여, 무중단 고가용성과 재해복구(DR)를 갖춘 클라우드 인프라를 구축한 프로젝트입니다. 단일 리전 기본 인프라에서 시작해 Hub-Spoke 망 분리 → 서비스 계층 강화 → 다중 리전 DR·하이브리드 연동 → 성능·운영 최적화까지 **5단계로 점진 확장**했으며, 전체 인프라를 Terraform으로 코드화했습니다.

데이터베이스는 보안 정책상 온프레미스에 유지한 뒤 Site-to-Site IPsec VPN으로 Azure와 연동했습니다. 배포된 인프라는 보안·네트워크·고가용성·하이브리드·캐시·재해복구·공유 스토리지·모니터링 8개 영역으로 나누어 실제 동작을 검증했습니다.

<br>

---

<br>

## 2. 수행 환경

### 2.1 시스템 아키텍처

두 리전(Korea Central·Japan East)에 동일한 **Hub-Spoke** 스택을 대칭 배포하고, 리전 내부는 VNet Peering으로 연결했습니다. Hub에는 Azure Firewall·Application Gateway·VPN Gateway 같은 공유·경계 서비스를, Spoke에는 워크로드(VMSS)와 Private Endpoint를 배치했습니다. 온프레미스 MySQL은 IPsec VPN으로 연동하고, Traffic Manager가 리전 장애 시 자동으로 절체합니다.

<div style="display:flex; gap:12px; flex-wrap:wrap; justify-content:center; align-items:flex-start;">
  <figure style="flex:10 1 220px; margin:0;">
    <img src="/assets/images/Project/azure-infra-m365-defender/architecture.png" alt="전체 아키텍처 구성도" style="width:100%;">
    <figcaption style="text-align:center; font-size:0.85em; color:#888;">다중 리전 Hub-Spoke · DR · IPsec VPN 전체 구성</figcaption>
  </figure>
  <figure style="flex:17 1 300px; margin:0;">
    <img src="/assets/images/Project/azure-infra-m365-defender/portal-resource-map.png" alt="Azure Portal 리소스 맵" style="width:100%;">
    <figcaption style="text-align:center; font-size:0.85em; color:#888;">실제 배포된 리소스 토폴로지</figcaption>
  </figure>
</div>

### 2.2 단계별 확장

단일 리전 최소 구성에서 다중 리전 최적화까지 5단계로 확장했습니다. 1~3단계는 Korea Central 단일 리전 구축기, 4단계에서 Japan East를 추가해 확장기로 전환됩니다.

| 단계 | 핵심 추가 구성 | 목표 |
|:---:|------|------|
| 1단계 | 단일 리전 기본(VNet·AppGW·VMSS·Bastion·NAT·PE·스토리지) | 기본 웹 서비스 |
| 2단계 | Hub-Spoke 망 분리·Peering | 네트워크 격리·확장성 |
| 3단계 | VMSS 오토스케일·WAF·Redis·PE·Log Analytics | 서비스 계층 강화 |
| 4단계 | Japan East 추가·Firewall·UDR·VPN(IPsec)·양 리전 대칭 | 다중 리전 DR·하이브리드 |
| 5단계 | Traffic Manager·Azure Files·통합 모니터링 | 자동 절체·성능·운영 |

### 2.3 네트워크 설계

두 리전 각각에 Hub VNet과 Spoke VNet을 두고 리전 내부에서 Peering으로 연결했습니다. 4개 VNet 대역과 온프레미스는 서로 겹치지 않으며, `GatewaySubnet`·`AzureBastionSubnet`은 Azure 강제 이름과 최소 /26 요건을 충족합니다.

| 리전 | VNet | 대역 | 주요 서브넷 |
|------|------|------|-------------|
| Korea Central | central-hub | 10.0.0.0/16 | AzureFirewall·AppGW·Gateway |
| Korea Central | central-spoke | 10.1.0.0/16 | Bastion·Web·PE |
| Japan East | japan-hub | 10.2.0.0/16 | AzureFirewall·AppGW·Gateway |
| Japan East | japan-spoke | 10.3.0.0/16 | Bastion·Web·PE |
| 온프레미스 | Bluemax NGF 100 | 10.10.34.0/24 | 서버팜(MySQL 10.10.34.119) |

> **DR 리전 선정** — Korea South는 가용 영역(Availability Zone)을 지원하지 않아 Zone 분산 HA가 불가능합니다. AZ를 지원하는 Japan East를 DR 리전으로 채택해 두 리전 모두 Zone-redundant로 구성했습니다.

<br>

---

<br>

## 3. 시스템 구성

### 3.1 보안 (Zero-Trust)

**Azure Firewall + UDR 중앙 집중 제어** — Hub에 Azure Firewall(Standard)을 배치하고 Spoke의 Web·PE 서브넷에 UDR을 적용해, 모든 아웃바운드가 강제로 Firewall을 경유하도록 했습니다. Firewall은 웹 서버 → 온프레미스 MySQL(3306)과 필요한 80/443 아웃바운드만 허용합니다.

| 라우트 테이블 | 0.0.0.0/0 | 온프레미스 경로 | 적용 서브넷 |
|------|------|------|------|
| central-web-rt | Firewall(10.0.0.4) | 10.10.34.0/24 → VNet GW | central Web |
| central-pe-rt | Firewall(10.0.0.4) | 없음(정상) | central PE |
| japan-web-rt | Firewall(10.2.0.4) | 10.10.34.0/24 → VNet GW | japan Web |
| japan-pe-rt | Firewall(10.2.0.4) | 없음(정상) | japan PE |

> **비대칭 라우팅 회피** — Application Gateway v2는 공인 IP로 직접 인바운드를 받아야 하므로 AppGW 서브넷엔 UDR을 적용하지 않았습니다. PE 서브넷엔 온프레미스 경로를 두지 않아 Private Endpoint 응답이 불필요하게 VPN GW로 향하지 않게 했습니다.

**Application Gateway WAF** — WAF_v2에 OWASP 3.2 룰셋을 Prevention 모드로 적용해 SQL Injection 등 L7 공격을 입구에서 차단합니다.

**Private Endpoint 격리** — 스토리지(File)·Redis를 공인망에서 차단하고 Spoke의 PE 서브넷에 Private Endpoint로 연결했습니다. 각 PaaS의 Private DNS Zone을 4개 VNet 전체에 링크해 내부에서 사설 IP로 이름이 풀리게 했습니다.

| PaaS | Private DNS Zone |
|------|------------------|
| Storage(File) | privatelink.file.core.windows.net |
| Managed Redis | privatelink.redis.azure.net |

> **Redis DNS Zone 주의** — 신형 Managed Redis는 `privatelink.redis.azure.net`을 씁니다. 구형(`redis.cache.windows.net`) 영역을 쓰면 PE 격리가 동작하지 않고 공인 IP가 반환됩니다.

**Bastion** — VMSS에 공인 IP를 할당하지 않고 Bastion으로 브라우저 원격 접속만 제공해 직접 SSH 노출을 제거했습니다. 서브넷·NIC엔 NSG로 화이트리스트를 적용했습니다.

### 3.2 고가용성·컴퓨팅 (VMSS)

Central VMSS는 가용 영역 1·2에 분산 배치(`zone_balance`)한 2대로 시작하고, Japan VMSS는 1대 대기로 두었습니다. 표준 Rocky Linux 9 이미지에 `custom_data`(cloud-init)를 주입해, 별도 골든 이미지 없이 부팅 시점에 WordPress 설치·온프레미스 DB 연결·Azure Files 마운트·Redis 연동을 자동 수행합니다. CPU 사용률 기반 오토스케일로 부하에 따라 인스턴스를 자동 증감합니다.

### 3.3 하이브리드 연동 (IPsec VPN)

양 리전의 VPN Gateway(VpnGw1AZ, RouteBased)와 온프레미스 Bluemax NGF 100 사이에 Site-to-Site IPsec 터널을 수립했습니다. 양 끝단 IPsec/IKE 정책(IKEv2·AES-256·SHA-256·DHGroup14·PFS None·SA 27000초)을 동일하게 맞춰야 터널이 성립합니다. VPN 터널 구간엔 NAT를 적용하지 않았는데, IPsec 구간에 NAT가 개입하면 응답 패킷이 디폴트 게이트웨이로 유출되어 터널이 끊기기 때문입니다.

### 3.4 데이터·캐시·재해복구

- **재해복구(Traffic Manager)** — 우선순위 라우팅으로 Central(1, Active)·Japan(2, Standby) 엔드포인트를 구성해, Central 장애 시 프로브 실패를 감지해 Japan East로 DNS를 전환합니다.
- **캐시(Redis)** — Managed Redis(Balanced_B1)를 WordPress 객체 캐시로 붙여 DB 부하를 줄이고(TLS·포트 10000), Private Endpoint로 격리했습니다.
- **공유 스토리지(Azure Files)** — `wp-content/uploads`를 SMB로 마운트해 인스턴스 간 미디어를 공유했습니다. 단일 계정에 복수 리전 PE를 연결하면 DNS A-record가 충돌하므로 Central(GRS)·Japan(LRS)으로 계정을 분리했습니다.
- **모니터링** — 리전별 Log Analytics로 VMSS·AppGW·Firewall 로그·메트릭을 수집했습니다.

<br>

---

<br>

## 4. 구축 검증

배포된 인프라가 설계대로 동작하는지 8개 영역으로 검증했습니다.

### 4.1 보안 (Zero-Trust · Firewall · WAF)

VMSS에 공인 IP가 없고, VMSS에서 `curl ifconfig.me` 시 Firewall 공인 IP(20.214.183.226)가 반환되어 아웃바운드가 UDR을 통해 Firewall을 강제 경유함을 확인했습니다.

![VMSS 공인 IP 미할당](/assets/images/Project/azure-infra-m365-defender/vmss-no-pubip.png)
_VMSS 인스턴스 공인 IP 미할당_

![Firewall 강제 경유](/assets/images/Project/azure-infra-m365-defender/firewall-egress.png)
_VMSS curl → 20.214.183.226 (Firewall 경유)_

외부에서 온프레미스 DB 공인 경로(1.220.76.2:3306)로 접근하면 차단되어, DB 포트가 외부에 노출되지 않음을 확인했습니다.

![외부 DB 접근 차단](/assets/images/Project/azure-infra-m365-defender/ext-db-blocked.png)
_외부에서 1.220.76.2:3306 접근 차단_

WAF에서 정상 요청은 200 OK, SQL Injection은 403 Forbidden으로 차단됩니다.

![정상 요청 200 OK](/assets/images/Project/azure-infra-m365-defender/http-200.png)
_정상 요청 → HTTP 200 OK_

![WAF SQL Injection 차단](/assets/images/Project/azure-infra-m365-defender/waf-403.png)
_SQL Injection(`?id=1 OR 1=1`) → 403 Forbidden_

### 4.2 네트워크 (Hub-Spoke Peering)

각 리전에서 Hub와 Spoke가 Peering으로 연결되어 정상 통신함을 확인했습니다.

![Central Peering](/assets/images/Project/azure-infra-m365-defender/peering-central.png)
_Central Hub ↔ Spoke Peering_

![Japan Peering](/assets/images/Project/azure-infra-m365-defender/peering-japan.png)
_Japan Hub ↔ Spoke Peering_

### 4.3 고가용성 · Auto Scaling

VMSS 2대 중 1대를 중지해도 쇼핑몰이 정상 접속되어 단일 인스턴스 장애에 대한 서비스 연속성을 확인했습니다. CPU 부하(~99%)로 threshold 70%를 초과시키자 인스턴스가 2대→5대로 자동 확장됐습니다.

![1대 중지 후 서비스 정상](/assets/images/Project/azure-infra-m365-defender/ha-1down.png)
_인스턴스 1대 중지 상태에서도 정상 접속_

![CPU 99% 부하](/assets/images/Project/azure-infra-m365-defender/cpu-99.png)
_yes 프로세스로 CPU ~99% (threshold 초과)_

![오토스케일 2→5대](/assets/images/Project/azure-infra-m365-defender/autoscale-2to5.png)
_2대 → 5대 자동 스케일아웃_

### 4.4 하이브리드 (VPN · 온프레미스 DB)

Site-to-Site VPN이 Connected 상태이고, VMSS(10.1.1.x)에서 온프레미스 MySQL(10.10.34.119:3306)로 정상 연동됨을 확인했습니다.

![VPN Connected](/assets/images/Project/azure-infra-m365-defender/vpn-connected.png)
_VPN 연결 상태 (Connected)_

![MySQL 연동](/assets/images/Project/azure-infra-m365-defender/mysql-linked.png)
_VMSS → 온프레미스 MySQL 연동_

### 4.5 캐시 (Redis PE 격리)

VMSS에서 `nslookup` 시 Redis가 `privatelink.redis.azure.net`으로 풀이되고 사설 IP(10.1.2.5)를 반환하여 Private Endpoint 격리가 정상 동작함을 확인했습니다.

![Redis nslookup](/assets/images/Project/azure-infra-m365-defender/redis-nslookup.png)
_nslookup → 사설 IP 10.1.2.5 (PE 격리)_

![WordPress Redis 연동](/assets/images/Project/azure-infra-m365-defender/redis-connected.png)
_wp redis status → Connected_

### 4.6 재해복구 (Traffic Manager Failover)

정상 상태에선 Central AppGW IP(20.214.152.240)가 반환되고, central-endpoint를 비활성화하자 japan-endpoint가 Online으로 전환되어 Japan AppGW IP(52.140.213.49)로 절체됐습니다.

![정상 운영 — Central](/assets/images/Project/azure-infra-m365-defender/dr-normal-central.png)
_정상 — Central IP(20.214.152.240) 반환_

![엔드포인트 전환](/assets/images/Project/azure-infra-m365-defender/dr-endpoint-switch.png)
_central Disabled / japan Online_

![Failover — Japan](/assets/images/Project/azure-infra-m365-defender/dr-failover-japan.png)
_Failover 후 — Japan IP(52.140.213.49) 반환_

데이터 일관성 검증으로, Central에서 회원가입(test01~03) 후 온프레미스 MySQL `shop_users`에서 해당 레코드를 확인했습니다.

![Central 회원가입](/assets/images/Project/azure-infra-m365-defender/signup-central.png)
_Central에서 test01 회원가입_

![MySQL 데이터 확인](/assets/images/Project/azure-infra-m365-defender/mysql-users.png)
_온프레미스 MySQL에 test01~03 저장 확인_

### 4.7 공유 스토리지 (Azure Files)

인스턴스 A에서 Azure Files에 업로드한 파일이 인스턴스 B에서 조회되어, 인스턴스 간 미디어 공유가 정상 동작함을 확인했습니다.

![인스턴스 A 업로드](/assets/images/Project/azure-infra-m365-defender/files-instanceA.png)
_인스턴스 A — Files 마운트 및 업로드_

![인스턴스 B 조회](/assets/images/Project/azure-infra-m365-defender/files-instanceB.png)
_인스턴스 B — 동일 파일 조회_

### 4.8 모니터링 (Log Analytics)

Log Analytics로 로그·메트릭이 정상 수집됨을 확인했습니다.

![Log Analytics 로그 수집](/assets/images/Project/azure-infra-m365-defender/loganalytics.png)
_Log Analytics 로그 수집_

![Redis Cache Hits 메트릭](/assets/images/Project/azure-infra-m365-defender/redis-metric.png)
_Azure Monitor — Redis Cache Hits_

<br>

---

<br>

## 5. 결론

단일 리전 기본 인프라에서 다중 리전 DR·하이브리드 연동까지 5단계로 점진 확장했고, 전체를 Terraform으로 코드화했습니다. 배포 결과를 보안·네트워크·고가용성·하이브리드·캐시·재해복구·공유 스토리지·모니터링 8개 영역에서 검증해 설계대로 동작함을 확인했습니다.

**한계 및 개선 방향**

- **HTTPS 미적용** — AppGW 리스너가 HTTP(80). 인증서·Key Vault 연동으로 443 SSL 종단 필요
- **VPN 단일 터널(SPOF)** — Active-Active VPN·회선 이중화 또는 ExpressRoute로 보완
- **시크릿 평문** — tfvars·스크립트 평문 값을 Key Vault + Managed Identity로 관리
- **DNS 기반 절체 지연** — Traffic Manager는 TTL만큼 지연. Front Door(L7)로 즉시 절체 개선
- **CI/CD 부재** — Terraform 수동 apply를 파이프라인으로 자동화

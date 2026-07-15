---
title: "하이브리드 클라우드 보안구축"
date: 2026-07-15 00:00:00 +0900
categories: [Project, Infra]
tags: [hybrid-cloud, on-premise, vlan, cisco, piolink, mysql-ha, keepalived, rsyslog, azure, terraform, ipsec-vpn]
---

## 1. 개요

기존 온프레미스 인프라를 클라우드로 한 번에 이관하면 운영 안정성 위험과 레거시 자원 낭비가 생깁니다. 그렇다고 클라우드의 확장성·가용성을 포기할 수도 없습니다. 이 절충안으로, 안정성이 중요한 데이터는 온프레미스에 남기고 트래픽 변동이 큰 웹 계층만 클라우드로 올리는 **하이브리드 클라우드** 체계를 구축했습니다.

온프레미스에는 VLAN으로 분리된 내부망, DB 이중화 서버팜, 중앙 로그·분석 서버, 경계 방화벽을 구성했고, 핵심 웹 서비스(WordPress·WooCommerce)는 Azure로 이전해 VMSS·오토스케일로 확장성을 확보했습니다. 데이터베이스는 보안 정책상 온프레미스에 유지하되 MySQL Master-Master 이중화로 고가용성을 확보했으며, 온프레미스와 Azure는 IPsec VPN으로 연결했습니다. Azure 인프라는 Terraform으로 Korea Central(Active)·Japan East(DR) 이중 리전에 대칭 배포했습니다.

**사용 장비 및 소프트웨어**

| 구분 | 장비 / 소프트웨어 |
|------|-------------------|
| 방화벽 | SECUI Bluemax NGF 100 |
| L3 / L2 스위치 | PIOLINK TiFRONT G24 / Cisco Catalyst 2960 × 2 |
| 서버 OS | Rocky Linux 9 |
| 웹 · DB | Apache / MySQL 8 (Master-Master + keepalived) |
| 로그 · 분석 | rsyslog / Wireshark |
| 클라우드 | Azure (VMSS · AppGW WAF · Firewall · Redis · Files · VPN GW · Traffic Manager) |
| IaC | Terraform (azurerm 4.74.0) |

**기간** 2026.7.2 ~ 7.20 (19일)

<br>

---

<br>

## 2. 인프라 설계

전체 구조는 온프레미스 내부망과 Azure 이중 리전을 IPsec VPN으로 연결한 하이브리드 형태입니다. 내부 단말은 용도별 VLAN으로 분리되고, VLAN 간 통신과 외부 통신은 모두 L3 스위치를 거쳐 Bluemax 방화벽을 경유하도록 경로를 강제해 중앙에서 통제합니다. Azure는 Korea Central과 Japan East에 동일한 Hub-Spoke 스택을 대칭 배포하고, 평상시 Central로 서비스하다 장애가 감지되면 Traffic Manager가 Japan East로 절체합니다. 온프레미스 DB는 Azure 웹 계층과 VPN 터널로만 통신하며, DR 상황에서도 양쪽 리전이 같은 온프레미스 DB를 바라보기 때문에 데이터 정합성이 유지됩니다.

![전체 아키텍처 구성도](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/architecture.png)
_온프레미스 + Azure 이중 리전 하이브리드 전체 구성_

내부망은 관리·보안팀(VLAN10), 일반 직원(VLAN20), 서버팜(VLAN30), 분석망(VLAN40), 방화벽 연동 구간(VLAN50)으로 나눴습니다. 서버팜에는 DB1·DB2와 DB VIP(192.168.3.6), 중앙 LOG 서버, 분석망에는 Analyse 서버를 배치했고, Azure는 Central Hub/Spoke(10.0·10.1)와 Japan Hub/Spoke(10.2·10.3)를 대칭 대역으로 설계해 서로 겹치지 않게 했습니다.

![온프레미스 장비 랙](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/rack.png)
_실제 구축한 장비 랙 — Bluemax 방화벽 · PIOLINK L3 · Cisco L2 · 서버_

<br>

---

<br>

## 3. 온프레미스 네트워크

**L2 스위치 (Cisco Catalyst 2960)** — 부서·용도별로 VLAN을 나눠 브로드캐스트 도메인을 분리했습니다. VLAN 분리는 단순한 트래픽 정리가 아니라, 부서 간 트래픽을 격리해 내부자 위협과 횡적 이동(lateral movement)의 범위를 좁히는 보안 조치입니다. 단말이 붙는 포트는 액세스 모드로 해당 VLAN에 배치하고, L3 스위치와 연결되는 포트는 트렁크로 구성해 여러 VLAN의 태그 트래픽을 한 회선으로 전달했습니다.

여기에 스위치 계층의 보안을 여러 겹으로 쌓았습니다. 액세스 포트에는 **BPDU Guard**를 걸어 비인가 스위치를 몰래 연결하거나 STP를 조작해 토폴로지를 흔드는 공격을 차단했고, 서버팜에 연결되는 포트에는 **Port Security**로 포트당 학습 MAC 수를 제한해 MAC 플러딩과 비인가 단말 접속을 막았습니다. 원격 관리는 도청 위험이 있는 평문 Telnet을 끄고 **SSH 전용**으로만 열되, 접속 출발지를 보안팀 대역으로만 제한하는 **VTY ACL**을 적용해 관리 인터페이스의 공격 표면을 최소화했습니다. 또한 모든 장비의 시각을 NTP로 맞추고 로그를 중앙 LOG 서버로 전송해, 보안 사고가 났을 때 여러 장비의 로그를 시간순으로 이어붙여 분석할 수 있게 했습니다.

**L3 스위치 (PIOLINK TiFRONT G24)** — VLAN마다 SVI(가상 인터페이스)를 게이트웨이로 두어 인터-VLAN 라우팅을 담당하게 하고, 기본 경로를 방화벽 구간으로 향하게 해 **외부로 나가는 모든 트래픽이 방화벽을 강제로 거치도록** 했습니다. 이렇게 하면 인터넷 접속 경로가 한 곳으로 모여 중앙에서 통제·감사할 수 있습니다. 핵심 통제로, 일반 직원(VLAN20)이 서버팜(VLAN30)에 직접 접근하지 못하도록 ACL로 차단하고 보안팀(VLAN10)만 허용했습니다. 마지막으로 특정 포트의 트래픽을 분석 서버로 **포트 미러링**해, 운영에 영향을 주지 않고 패킷 사본을 실시간으로 들여다볼 수 있게 구성했습니다.

<br>

---

<br>

## 4. 온프레미스 서버

서버팜(VLAN30)에 DB 이중화·Log·Analyse 서버를 구축했습니다.

### 4.1 DB 서버 이중화 (MySQL Master-Master + keepalived VIP)

DB는 단일 장애점이 되기 쉬운 지점이라, db1·db2 두 노드를 양방향 복제로 묶어 이중화했습니다. 두 노드에 서로 다른 식별자(server-id)를 부여하고 바이너리 로그를 켠 뒤, 자동 증가 값의 간격을 2로 두고 시작 오프셋을 db1은 홀수·db2는 짝수로 분리했습니다. 이렇게 하면 양쪽에서 동시에 데이터가 들어와도 기본키가 겹치지 않아 복제 충돌이 나지 않습니다. 각 노드의 바이너리 로그 위치를 기준으로 상대 노드를 복제 소스로 지정하는 설정을 양방향으로 걸어 Master-Master 구조를 완성했습니다.

그 위에 keepalived로 가상 IP(VIP, 192.168.3.6)를 두었습니다. 단순히 DB를 두 대로 늘리는 것만으로는 한 대가 죽었을 때 클라이언트가 죽은 IP를 계속 물고 있어 서비스가 끊깁니다. 그래서 MySQL이 살아있는지 주기적으로 확인하는 헬스체크를 VRRP에 연동해, 우선순위가 높은 db1(우선순위 110)이 정상일 때 VIP를 보유하다가 장애가 나면 헬스체크 실패로 우선순위가 내려가고 db2(우선순위 100)가 VIP를 자동으로 넘겨받도록 했습니다. 웹 서버와 Azure VMSS는 개별 DB IP가 아니라 **VIP로만** 접속하기 때문에, 노드가 죽어도 접속 대상이 바뀌지 않고 서비스가 이어집니다.

**검증** — 한쪽 노드에서 만든 데이터가 반대 노드로 즉시 복제되는지, 그리고 VIP를 통한 접속이 활성 노드로 정상 연결되는지 확인했습니다.

![DB Master-Master 양방향 복제](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/db-replication.png)
_한쪽 노드에서 생성한 데이터가 반대 노드로 즉시 복제됨_

![keepalived VIP 접속](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/keepalived-vip.png)
_VIP(192.168.3.6)를 통한 DB 접속 — 활성 노드로 자동 연결_

### 4.2 DB 서버 보안

설치 직후의 위험한 기본값을 정리하는 것부터 시작했습니다. 익명 계정·원격 root 로그인·테스트 DB 등 기본 취약 요소를 제거하고, DB 계정이 아무 데서나 붙지 못하도록 허가된 출발지(WEB·VMSS 대역)에서만 접속할 수 있게 계정 단위로 제한했습니다. 여기에 더해 방화벽(firewalld)에서 MySQL 포트(3306)를 허용 IP에 한해서만 열어, 계정 통제와 네트워크 통제를 이중으로 걸었습니다.

### 4.3 Log 서버 (RAID1 + rsyslog)

로그는 사고 분석의 근거라 유실되면 안 됩니다. 디스크 2개를 RAID1로 미러링해 한 쪽이 고장나도 로그가 보존되게 하고, 마운트 정보를 부팅 설정에 등록해 재부팅 후에도 구성이 유지되도록 했습니다. rsyslog는 UDP·TCP 514로 원격 로그를 수신하고, 장비 IP별·날짜별로 파일을 분리 저장하는 템플릿을 적용해 스위치·서버 로그를 한곳에서 체계적으로 볼 수 있게 했습니다.

### 4.4 Analyse 서버 (포트 미러링 + Wireshark)

L3에서 미러링해 보낸 트래픽을 tshark/Wireshark로 캡처해 분석합니다. 수집 전용 서버가 자칫 라우터처럼 악용되지 않도록 IP 포워딩을 꺼두고, 관리 접속(SSH)은 보안팀 대역만 허용했습니다. 미러링된 트래픽에서 실제 서비스 세션이 잡히는지는 뒤의 검증(7.2)에서 확인합니다.

<br>

---

<br>

## 5. 온프레미스 방화벽 (SECUI Bluemax NGF 100)

WAN과 내부망 경계에 방화벽을 두어 NAT·패킷 필터링·로그를 통제했습니다. 내부 사설 대역의 인터넷 접속은 SNAT로 처리했지만, **IPsec VPN 터널로 오가는 트래픽은 NAT 대상에서 제외**했습니다. VPN 구간은 사설 IP 그대로 통신해야 하는데 여기에 NAT가 끼어들면 응답 패킷의 경로가 어긋나 터널이 정상 동작하지 않기 때문입니다. 이 예외 처리가 하이브리드 연동의 핵심 포인트였습니다.

보안 정책은 화이트리스트 방식으로 짰습니다. 내부 사용자의 인터넷 접속, Azure VMSS와 온프레미스 DB 간의 MySQL 통신, 장비·서버의 로그 전송처럼 반드시 필요한 통신만 허용하고, 마지막 규칙에서 그 외 모든 트래픽을 차단하는 기본 거부(default deny)로 최소 권한 원칙을 적용했습니다. 방화벽 관리 콘솔 접근도 보안팀·관리 대역으로만 제한하고, 통과·차단 로그를 함께 수집해 어떤 트래픽이 오갔는지 추적할 수 있게 했습니다.

<br>

---

<br>

## 6. Azure 하이브리드 (Terraform IaC)

Azure 측은 전체를 Terraform으로 코드화해 Korea Central(Active)·Japan East(DR) 이중 리전에 Hub-Spoke로 배포했습니다. 코드로 관리했기 때문에 두 리전을 동일한 구성으로 빠르게 복제할 수 있었습니다.

**네트워크·보안** — 리전마다 공유 서비스용 Hub VNet과 워크로드용 Spoke VNet을 분리하고 Peering(Gateway Transit)으로 연결해, Spoke가 Hub의 VPN Gateway를 공유하며 DR 상황에서도 온프레미스와 통신이 유지되게 했습니다. UDR(사용자 지정 라우팅)로 Spoke의 아웃바운드를 Azure Firewall에 강제 경유시켜 온프레미스와 동일하게 중앙 집중 통제를 구현했고, NSG로 서브넷 수준의 1차 방어선을, 공인 IP 없이 포털로 접속하는 Bastion으로 관리 노출 제거를 적용했습니다.

**컴퓨팅·웹** — Application Gateway에 WAF(OWASP 룰셋·Prevention 모드)를 붙여 SQL Injection 등 웹 공격을 입구에서 차단하고, VMSS와 CPU 기반 오토스케일로 부하에 따라 인스턴스를 자동 증감했습니다. 부팅 스크립트로 WordPress·WooCommerce를 자동 구성해 스케일아웃 시에도 동일한 웹 서버가 배포되게 했습니다.

**데이터·캐시** — Azure Files를 공유 마운트해 인스턴스 간 업로드 미디어를 일관되게 제공하고, Managed Redis를 객체 캐시로 붙여 DB 부하를 줄였습니다. 둘 다 Private Endpoint로 공인망에서 격리했습니다.

**하이브리드·DR** — Central·Japan 양쪽 VPN Gateway와 온프레미스 Bluemax 사이에 IKEv2·AES-256·SHA-256·DHGroup14 정책의 IPsec 터널을 이중으로 수립해, Central이 죽어도 Japan 터널로 온프레미스 DB 연동이 유지되게 했습니다. 그 위에 Traffic Manager 우선순위 라우팅을 얹어, 평상시 Central로 보내다가 장애를 감지하면 Japan East로 자동 절체하도록 했습니다.

<br>

---

<br>

## 7. 시나리오 검증

설계한 접근 제어·연동·모니터링이 실제로 동작하는지 시나리오별로 점검했습니다.

### 7.1 접근 제어 (VLAN · ACL)

가장 중요한 통제인 "일반 직원은 서버팜에 접근할 수 없어야 한다"를 먼저 확인했습니다. 보안팀(VLAN10) PC에서는 서버팜 서버로 ping이 정상적으로 오가지만, 일반 직원(VLAN20) PC에서는 L3 ACL에 막혀 응답이 오지 않았습니다.

![보안팀 서버팜 ping 성공](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/acl-ping-ok.png)
_보안팀 PC → 서버팜(192.168.3.2) ping 성공_

![일반 직원 서버팜 ping 차단](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/acl-ping-deny.png)
_일반 직원 PC → 서버팜 ping 차단 (L3 ACL)_

같은 방식으로 계층 분리가 전반적으로 동작하는지 12개 시나리오를 보안팀·일반 직원 두 관점으로 나눠 점검했습니다. 결과를 요약하면 다음과 같습니다.

| 검증 시나리오 | 보안팀 (VLAN10) | 일반 직원 (VLAN20) |
|---------------|:---------------:|:------------------:|
| 서버팜(VLAN30) L3 ping | 허용 | 차단 |
| Analyse 서버 접근 | 허용 | 차단 |
| 중앙 Log 서버 SSH | 허용 | 차단 |
| L2 스위치 관리 SSH | 허용 | 차단 |
| 방화벽 관리 콘솔 | 허용 | 차단 |
| Azure WEB 직접 SSH·RDP | 차단 (Bastion 경유만) | 차단 |
| 인터넷·Azure WEB 서비스 접속 | 허용 | 허용 |

핵심 자원(서버팜·관리 장비)은 보안팀만 도달할 수 있고, 일반 직원은 서비스 이용에 필요한 인터넷·웹 접속만 가능하도록 계층이 분리됨을 확인했습니다. 웹 서버로의 직접 관리 접속(SSH·RDP)은 누구에게도 열지 않고 Bastion·Application Gateway를 거치는 경로만 허용해, 관리 인터페이스가 외부에 노출되지 않도록 했습니다.

**중앙 Log 서버 SSH** — 보안팀은 Log 서버에 SSH로 접속되지만, 일반 직원(192.168.2.11)이 시도하면 포트 22 연결이 timeout으로 차단됩니다.

![Log 서버 SSH 접속 성공](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/acl-log-ssh-ok.png)
_보안팀 → Log 서버 SSH 접속 성공_

![일반 직원 Log 서버 SSH 차단](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/acl-log-ssh-deny.png)
_일반 직원 → Log 서버 SSH 차단 (TCP 22 timeout)_

**L2 스위치 관리 SSH** — VTY ACL에 따라 보안팀(192.168.1.1)만 스위치 관리에 접속됩니다. 일반 직원은 스위치까지 ping은 닿아도 SSH 포트(22)는 차단됩니다.

![보안팀 L2 스위치 SSH 성공](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/acl-l2-ssh-ok.png)
_보안팀 → L2 스위치 SSH 성공 (TcpTestSucceeded: True)_

![L2 스위치 SSH 로그인 성공](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/acl-l2-ssh-login.png)
_L2 스위치 SSH 로그인 성공 (admin → L2-2# 프롬프트 진입)_

![일반 직원 L2 스위치 SSH 차단](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/acl-l2-ssh-deny.png)
_일반 직원 → L2 스위치 포트 22 차단_

**분석(Analyse) 서버 접근** — 트래픽 분석 서버는 보안팀만 접속할 수 있습니다.

![Analyse 서버 접속 성공](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/acl-analyse-ok.png)
_보안팀 → Analyse 서버 접속 성공_

**인터넷·Azure 웹 서비스 접속** — 일반 직원도 업무에 필요한 인터넷과 쇼핑몰(서비스) 접속은 정상적으로 됩니다. 다만 웹 서버로의 직접 관리 접속(SSH·RDP)은 차단됩니다. 서비스 이용과 관리 접근을 분리한 것입니다.

![일반 직원 인터넷 접속](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/internet-access.png)
_일반 직원 → 인터넷(8.8.8.8) 접속 정상_

![일반 직원 Azure 웹 서비스 접속](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/acl-azweb-service.png)
_일반 직원 → Azure 쇼핑몰(서비스) 정상 접속_

![Azure 웹 직접 SSH·RDP 차단](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/acl-azweb-ssh-deny.png)
_Azure 웹 서버 직접 SSH(22)·RDP(3389) 접속 차단_

### 7.2 트래픽 분석 (포트 미러링)

L3에서 미러링한 트래픽을 Analyse 서버에서 tshark로 캡처해, MySQL(3306) 세션 등이 예상한 경로로 흐르는지 들여다봤습니다. 운영 트래픽에 영향을 주지 않고도 내부 통신을 관찰·감사할 수 있는 체계를 확인한 것입니다.

![DB 트래픽 캡처](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/wireshark-db.png)
_미러링 트래픽에서 MySQL(3306) 세션 캡처_

![서버팜 트래픽 캡처](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/traffic-serverfarm.png)
_서버팜 구간 트래픽 캡처_

![웹 트래픽 캡처](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/traffic-web.png)
_웹 트래픽(HTTP 80·HTTPS 443) 캡처_

### 7.3 모니터링 (Log Analytics)

Azure 측은 Firewall·WAF·Application Gateway 로그를 Log Analytics로 모아, WAF가 탐지·차단한 공격을 KQL로 조회했습니다. 공격 시도가 실제로 로그에 남고 조회되는지 확인해, 사후 추적 체계가 동작함을 검증했습니다.

![Azure Firewall 로그](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/loganalytics-firewall.png)
_Log Analytics — Azure Firewall Deny 이벤트 로그_

![WAF 차단 로그](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/waf-log.png)
_Log Analytics — WAF가 Matched/Blocked 처리한 공격 로그_

![Application Gateway 액세스 로그](https://nodoff365.github.io/assets/images/Project/hybrid-cloud-security/loganalytics-appgw.png)
_Log Analytics — Application Gateway 액세스 로그 (응답 코드별 건수)_

### 7.4 하이브리드 · DR

VPN 터널을 통한 VMSS ↔ 온프레미스 DB(VIP) 연동이 정상 동작하는지, 그리고 Central을 비활성화했을 때 Traffic Manager가 Japan East로 절체하는지 확인했습니다. DB가 온프레미스 단일 지점(VIP)에 있으므로 어느 리전에서 접속해도 동일한 데이터가 유지됩니다.

<br>

---

<br>

## 8. 결론

온프레미스 네트워크(VLAN·트렁크·ACL·포트 미러링)·서버(DB Master-Master 이중화·중앙 로그·트래픽 분석)·경계 방화벽을 직접 구축하고, Azure 이중 리전 Hub-Spoke를 Terraform으로 배포해 IPsec VPN으로 연결했습니다. 접근 제어·트래픽 분석·모니터링·하이브리드 연동·DR 절체를 시나리오별로 검증해 설계 의도대로 동작함을 확인했습니다.

**한계 및 개선 방향**

- **단일 회선·단일 VPN 터널** — WAN·VPN 경로가 단일 구간이라 장애 시 전체 연결이 끊깁니다. Active-Active VPN·회선 이중화로 보완이 필요합니다.
- **방화벽 이중화 부재** — Bluemax 단일 장비가 SPOF입니다. HA 쌍 구성으로 가용성을 높일 수 있습니다.
- **시크릿 관리** — DB·VPN 자격증명을 Key Vault 등으로 외부화하고 정기 회전이 필요합니다.
- **HTTPS 미적용** — AppGW 리스너가 HTTP(80)입니다. 인증서·SSL 종단 적용이 필요합니다.

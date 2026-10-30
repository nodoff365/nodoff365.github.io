---
title: "Rocky Linux DHCP 서버 구성 및 Windows 클라이언트 테스트"
date: 2026-05-27 00:00:00 +0900
categories: [클라우드 기초, 인프라 실습]
tags: [DHCP, RockyLinux, Windows, APIPA, Network]
---
### 1. 개요

> VMware 시리즈에서 만든 실습 환경([2편 Rocky Linux 9](/클라우드기초/인프라실습/vmware_02_rocky9/), [3편 Windows 10](/클라우드기초/인프라실습/vmware_03_win10/), [4편 Windows 11](/클라우드기초/인프라실습/vmware_04_win11/))을 그대로 사용한다. <br>rocky9-1에 DHCP 서버를 올리고, Windows 10/11 클라이언트가 IP를 자동으로 받는지 확인한다. <br>DHCP의 동작 원리(DORA)를 먼저 정리하고, 서버 구성, 클라이언트 테스트, APIPA 확인, MAC 주소 기반 IP 예약 순서로 진행한다.

<br>

---

<br>
### 2. DHCP란?

> 실습에서 확인할 동작을 이해하려면 DHCP가 IP를 나눠주는 과정을 먼저 알아야 하기 때문에 개념부터 정리한다.

DHCP(Dynamic Host Configuration Protocol)는 네트워크에 연결된 클라이언트에게 IP 주소, 서브넷마스크, 게이트웨이, DNS 등을 자동으로 할당해주는 프로토콜이다.

수동으로 IP를 설정하면 충돌 위험이 있고 관리가 번거로운데, DHCP를 사용하면 서버가 IP 풀을 관리하며 자동으로 배분하기 때문에 효율적이다.

- 프로토콜: **UDP**
- 서버 포트: **67** / 클라이언트 포트: **68**

<br>
**DORA 동작 흐름**

클라이언트가 처음 네트워크에 연결되면 아래 4단계로 IP를 받아온다.

| 단계 | 방향 | 설명 |
|------|------|------|
| **Discover** | Client → Broadcast | 네트워크 전체에 DHCP 서버 탐색 |
| **Offer** | Server → Client | 서버가 IP, 서브넷마스크, 게이트웨이, DNS, 임대시간 등 제안 |
| **Request** | Client → Broadcast | 제안받은 IP 사용 의사 확인 요청 |
| **ACK** | Server → Client | 최종 IP 정보 확정 및 전달 |

> 초기 통신은 클라이언트에 IP가 없기 때문에 Broadcast로 진행된다.

<br>

---

<br>
### 3. 실습 환경

> 서버가 나눠줄 IP 범위와 고정으로 비워둘 범위를 미리 정해두어야 설정 파일을 작성할 때 헷갈리지 않는다.

| 항목 | 값 |
|------|-----|
| 네트워크 대역 | 10.0.0.0/24 |
| DHCP 서버 (rocky9-1) | 10.0.0.11 |
| Gateway | 10.0.0.254 |
| DHCP 할당 범위 | 10.0.0.31 ~ 10.0.0.250 |
| 서버 고정 IP 대역 (제외) | 10.0.0.1 ~ 10.0.0.30, 10.0.0.251 ~ 10.0.0.254 |
| 기본 임대시간 | 2시간 (7200초) |
| 최대 임대시간 | 4시간 (14400초) |
| DNS | 168.126.63.1, 8.8.8.8 |
| 클라이언트 | Windows 10, Windows 11 |

<br>

---

<br>
### 4. Rocky Linux DHCP 서버 구성

> DHCP 서버 역할을 하는 dhcpd 데몬을 설치하고, 위 실습 환경에 맞게 설정 파일을 작성한 뒤 서비스를 시작한다.

#### 4.1 패키지 설치

```bash
dnf install -y dhcp-server
```

- `dnf`는 의존성 패키지를 함께 설치하고, `-y` 옵션은 설치 중 확인 질문을 자동으로 넘긴다.
- 설치가 끝나면 `/etc/dhcp/dhcpd.conf`가 생성되지만 내용은 비어 있다.

<br>
#### 4.2 설정 파일 준비

> 설정 파일이 비어 있어서 처음부터 작성하기보다, 패키지에 포함된 예시 파일을 가져와 고치는 편이 빠르고 문법 실수가 적다.

**방법 1 - 예시 파일을 설정 파일에 덮어쓰기**

```bash
cp /usr/share/doc/dhcp-server/dhcpd.conf.example /etc/dhcp/dhcpd.conf
```

**방법 2 - vi 편집기에서 예시 파일 내용 불러오기**

```bash
vi /etc/dhcp/dhcpd.conf
```

vi 안에서 아래 명령어로 예시 내용을 파일 끝에 붙여넣는다.

```
:$r /usr/share/doc/dhcp-server/dhcpd.conf.example
```

- 두 방법 모두 결과는 같다. 방법 2는 기존 내용을 지우지 않고 뒤에 붙인다.

<br>
#### 4.3 설정 파일 편집

> 예시 파일에는 이 실습에 필요 없는 설정이 많아서, 필요한 부분만 남기고 지운 뒤 실습 환경에 맞게 수정한다.

예시 파일에서 필요한 부분은 첫 번째 `subnet 10.5.5.0` 블록(9줄)이다. 예시 파일의 줄 번호는 패키지 버전마다 달라서, 줄 번호 대신 이 블록의 위치를 기준으로 지운다.

```
/subnet 10.5.5.0   # 검색: "subnet 10.5.5.0"이 있는 첫 줄로 커서 이동 (입력 후 Enter)
:1,.-1d            # 삭제: 1번째 줄부터 현재 줄 바로 앞(.-1)까지 삭제, .은 현재 줄을 뜻한다
:10,$d             # 삭제: 10번째 줄부터 마지막 줄($)까지 삭제
```

- `/`는 검색, `:`는 명령 입력이다. 입력한 뒤 Enter를 눌러야 실행된다.
- 첫 번째 삭제로 `subnet` 줄이 1번째 줄이 되고, 두 번째 삭제로 블록 아래가 모두 지워진다.

> `:se nu` 로 줄 번호를 표시해서 `subnet`부터 `}`까지 1~9번째 줄만 남았는지 확인한다.

필요한 부분만 남긴 후 실습 환경에 맞게 수정한다.

```
subnet 10.0.0.0 netmask 255.255.255.0 {
    range 10.0.0.31 10.0.0.250;
    option domain-name "abc.local";
    option domain-name-servers 168.126.63.1, 8.8.8.8;
    option routers 10.0.0.254;
    # option broadcast-address 10.0.0.255;   <- 주석 처리
    default-lease-time 7200;
    max-lease-time 14400;
}
```
![](/assets/images/DHCP/1.png)
- `range`는 클라이언트에게 나눠줄 IP 범위이고, `routers`와 `domain-name-servers`는 클라이언트가 함께 받아가는 게이트웨이와 DNS이다.
- `broadcast-address`는 주석 처리한다. 명시하지 않아도 서브넷 기준으로 자동 계산되며, 잘못 설정하면 오류가 발생할 수 있다.

<br>
#### 4.4 서비스 시작

> 설정 파일을 읽어서 동작하는 서비스이므로, 설정을 마친 뒤 시작하고 정상 실행 중인지 확인한다.

```bash
systemctl enable --now dhcpd   # 시작 + 재부팅 후 자동 실행
systemctl status dhcpd         # 상태 확인
```
![](/assets/images/DHCP/2.png)
- `active (running)`이 표시되면 DHCP 서버가 정상 실행 중이다.

오류가 발생하면 아래 명령어로 로그를 확인한다.

```bash
journalctl -xe
```

- 설정 파일의 문법 오류(세미콜론 누락, 중괄호 불일치)가 가장 흔한 원인이고, 로그에 오류가 나는 줄 번호가 표시된다.

<br>
#### 4.5 임대 현황 확인

> 서버가 어떤 클라이언트에게 어떤 IP를 줬는지 확인하면, 실제로 할당이 이루어졌는지 서버 쪽에서도 검증할 수 있다.

```bash
cat /var/lib/dhcpd/dhcpd.leases
```

- 클라이언트가 IP를 받은 뒤에 이 파일에 임대 기록(IP, MAC 주소, 임대 시작·종료 시각)이 남는다.

<br>

---

<br>
### 5. Windows 10/11 클라이언트 테스트

> 서버 설정이 끝났으니, 클라이언트를 자동 IP 설정으로 바꾸고 서버가 준 IP를 실제로 받는지 확인한다.

#### 5.1 IP 자동 설정으로 변경

`실행(Win+R) → ncpa.cpl → Ethernet0 우클릭 → 속성 → 인터넷 프로토콜 버전 4(TCP/IPv4) → 자동으로 IP 주소 받기`

<br>
#### 5.2 IP 확인 및 갱신

cmd에서 아래 명령어로 테스트한다.

```
ipconfig /all       # 전체 IP 구성 정보 확인 (DHCP 서버 주소도 표시됨)
ipconfig /release   # 현재 IP 반납
ipconfig /renew     # DHCP 서버로부터 새 IP 요청
```
![](/assets/images/DHCP/3.png)
- `DHCP 서버` 항목에 `10.0.0.11`이 표시되고 `IPv4 주소`가 `10.0.0.31 ~ 10.0.0.250` 범위에 있으면 서버에서 정상적으로 받은 것이다.
- `임대 시작 시간`과 `임대 만료 시간`의 차이가 설정한 기본 임대시간(2시간)과 같은지도 확인할 수 있다.

<br>

---

<br>
### 6. APIPA 동작 확인

> DHCP 서버가 없을 때 클라이언트가 어떻게 동작하는지 확인하면, DHCP가 왜 필요한지와 장애 시 증상을 이해할 수 있다.

DHCP 서버가 꺼진 상태에서 클라이언트가 IP를 요청하면 서버로부터 응답을 받지 못한다. 이때 Windows는 **APIPA(Automatic Private IP Addressing)** 로 `169.254.x.x` 대역의 IP를 스스로 할당한다.

- 대역: `169.254.0.0/16`
- 게이트웨이 없음 → 외부 통신 불가, 같은 대역 내 로컬 통신만 가능

**테스트 순서**

1. Rocky에서 dhcpd 중지

   ```bash
   systemctl stop dhcpd
   ```

2. Win10/11에서 IP 갱신 시도

   ```
   ipconfig /release
   ipconfig /renew
   ```

3. `169.254.x.x` 주소가 할당되는 것 확인

![](/assets/images/DHCP/4.png)
- `IPv4 주소`가 `169.254.x.x`이고 `기본 게이트웨이`가 비어 있으면 APIPA로 동작한 것이다.
- 이 상태에서는 인터넷이나 다른 대역과 통신할 수 없어서, 사용자는 "네트워크는 연결됐는데 인터넷이 안 된다"는 증상을 겪는다.

<br>

---

<br>
### 7. MAC 주소 기반 IP 예약

> 서버나 특정 장비처럼 IP가 바뀌면 안 되는 경우에는, 클라이언트의 MAC 주소로 항상 같은 IP를 할당하도록 예약한다.

#### 7.1 Windows에서 MAC 주소 변경 (테스트용)

실제 MAC 주소 대신 테스트용 임의 주소로 변경해서 예약 동작을 확인한다.

`실행(Win+R) → ncpa.cpl → Ethernet0 우클릭 → 속성 → 구성 → 고급 → Locally Administered Address → 값 체크 → 주소 입력 → 확인`

- Windows 10: `000000000001`
- Windows 11: `000000000002`

![](/assets/images/DHCP/5.png)
- 변경 후 `ipconfig /all`의 `물리적 주소`가 입력한 값으로 바뀐 것을 확인할 수 있다.

<br>
#### 7.2 dhcpd.conf에 예약 추가

```bash
vi /etc/dhcp/dhcpd.conf
```

설정 파일 subnet 블록 안에 아래 형식으로 추가한다.

```
host win10 {
    hardware ethernet 00:00:00:00:00:01;
    fixed-address 10.0.0.101;
}

host win11 {
    hardware ethernet 00:00:00:00:00:02;
    fixed-address 10.0.0.201;
}
```
![](/assets/images/DHCP/6.png)
- `hardware ethernet`은 예약 대상의 MAC 주소이고, `fixed-address`는 그 장비에 항상 줄 IP이다.
- MAC 주소 구분자를 `-`로 복사한 경우 `:`으로 바꿔야 한다. vi에서 `11s/-/:/g` 명령어로 해당 줄의 `-`를 모두 `:`으로 치환할 수 있다.

<br>
#### 7.3 서비스 재시작 및 확인

```bash
systemctl restart dhcpd
```

Win10/11에서 `ipconfig /release` 후 `ipconfig /renew`를 실행한다.

![](/assets/images/DHCP/7.png)
- 예약한 IP(`10.0.0.101`, `10.0.0.201`)로 할당되면 MAC 주소 기반 예약이 동작하는 것이다.
- 설정 파일을 바꾼 뒤에는 서비스를 재시작해야 반영된다.

<br>

---

<br>
### 8. 정리 및 초기화

> 실습이 끝나면 다음 글의 구성에 영향을 주지 않도록 DHCP 서버를 지우고, 실습 중 바꾼 클라이언트 설정도 원래대로 되돌린다.

#### 8.1 DHCP 서버 정리

DHCP 서비스 중지

```bash
systemctl stop dhcpd
```

DHCP 서버 삭제

```bash
dnf autoremove -y dhcp-server
rm -rf /etc/dhcp/ /var/lib/dhcpd
```

- `autoremove`는 dhcp-server와 함께 설치됐지만 더 이상 필요하지 않은 의존성 패키지도 함께 제거한다.

<br>
#### 8.2 Windows 클라이언트 복구

> VMware 시리즈에서 Windows 10/11은 고정 IP(`10.0.0.101`, `10.0.0.201`)로 구성했으므로, 실습 중 바꾼 자동 IP 설정과 MAC 주소를 원래대로 되돌려야 이후 글의 환경과 맞는다.

**IP 설정을 고정 IP로 되돌리기**

`실행(Win+R) → ncpa.cpl → Ethernet0 우클릭 → 속성 → 인터넷 프로토콜 버전 4(TCP/IPv4) → 다음 IP 주소 사용`

- Windows 10: IP `10.0.0.101`
- Windows 11: IP `10.0.0.201`
- 서브넷 마스크: `255.255.255.0`
- 기본 게이트웨이: `10.0.0.254`
- DNS: `168.126.63.1`, `8.8.8.8`

**MAC 주소 원복**

`실행(Win+R) → ncpa.cpl → Ethernet0 우클릭 → 속성 → 구성 → 고급 → Locally Administered Address → 사용 안 함(또는 값 삭제) → 확인`

- `ipconfig /all`의 `물리적 주소`가 원래 MAC 주소로 돌아왔는지 확인한다.

---

다음 글에서는 ~를 다룬다.

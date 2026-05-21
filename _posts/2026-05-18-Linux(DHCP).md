---
title: "Rocky Linux DHCP 서버 구성 및 Windows 클라이언트 테스트"
date: 2026-05-18 00:00:00 +0900
categories: [클라우드 기초, 인프라 실습]
tags: [dhcp, rocky-linux, windows, apipa, network]
---
## 1. DHCP란?

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

---

## 2. 실습 환경

| 항목 | 값 |
|------|-----|
| 네트워크 대역 | 10.0.0.0/24 |
| DHCP 서버 (Rocky Linux 1) | 10.0.0.11 |
| Gateway | 10.0.0.254 |
| DHCP 할당 범위 | 10.0.0.31 ~ 10.0.0.250 |
| 서버 고정 IP 대역 (제외) | 10.0.0.1 ~ 10.0.0.30, 10.0.0.251 ~ 10.0.0.254 |
| 기본 임대시간 | 2시간 (7200초) |
| 최대 임대시간 | 4시간 (14400초) |
| DNS | 168.126.63.1, 8.8.8.8 |
| 클라이언트 | Windows 10, Windows 11 |

---

## 3. Rocky Linux DHCP 서버 구성

3.1 패키지 설치

```bash
dnf install -y dhcp-server
```

dnf는 기본적으로 의존성 패키지를 함께 설치하며, `-y` 옵션으로 설치 중 확인 질문을 자동으로 넘긴다.

3.2 설정 파일 준비

설치 후 `/etc/dhcp/dhcpd.conf`가 생성되지만 내용이 비어있다.  
패키지에 포함된 예시 파일을 활용해 작성한다.

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

3.3 설정 파일 편집

예시 파일에는 불필요한 내용이 많다. 필요한 부분만 남기고 삭제한다.

```
:1,51d      # 1~51번째 줄 삭제
:10,28d     # 10~28번째 줄 삭제
:14,$d      # 14번째 줄부터 끝까지 삭제
```

> `:se nu` 로 줄 번호를 표시할 수 있다.

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

> `broadcast-address`는 주석 처리한다. 명시하지 않아도 서브넷 기준으로 자동 계산되며, 잘못 설정 시 오류가 발생할 수 있다.

[캡처 - dhcpd.conf 설정 완료 화면]

3.4 서비스 시작

[캡처 - systemctl status dhcpd 정상 실행 화면]

```bash
systemctl enable --now dhcpd   # 시작 + 재부팅 후 자동 실행
systemctl status dhcpd         # 상태 확인
```

오류가 발생하면 아래 명령어로 로그를 확인한다.

```bash
journalctl -xe
```

3.5 임대 현황 확인

DHCP 서버가 어떤 클라이언트에게 IP를 할당했는지 확인할 수 있다.

```bash
cat /var/lib/dhcpd/dhcpd.leases
```

---

## 4. Windows 10/11 클라이언트 테스트

4.1 IP 자동 설정으로 변경

`실행(Win+R) → ncpa.cpl → Ethernet0 우클릭 → 속성 → 인터넷 프로토콜 버전 4(TCP/IPv4) → 자동으로 IP 주소 받기`

4.2 IP 확인 및 갱신

[캡처 - ipconfig /all 결과, DHCP 서버 주소 및 할당 IP 확인]

cmd에서 아래 명령어로 테스트한다.

```
ipconfig /all       # 전체 IP 구성 정보 확인 (DHCP 서버 주소도 표시됨)
ipconfig /release   # 현재 IP 반납
ipconfig /renew     # DHCP 서버로부터 새 IP 요청
```

---

## 5. APIPA 동작 확인

DHCP 서버가 꺼진 상태에서 클라이언트가 IP를 요청하면 서버로부터 응답을 받지 못한다.  
이때 Windows는 **APIPA(Automatic Private IP Addressing)** 로 `169.254.x.x` 대역의 IP를 스스로 할당한다.

- 대역: `169.254.0.0/16`
- 게이트웨이 없음 → 외부 통신 불가, 같은 대역 내 로컬 통신만 가능

테스트 순서

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

[캡처 - APIPA 주소(169.254.x.x) 할당된 ipconfig /all 결과]

---

## 6. MAC 주소 기반 IP 예약

특정 클라이언트에게 항상 동일한 IP를 할당하고 싶을 때 MAC 주소를 기반으로 예약할 수 있다.  
서버나 특정 장비처럼 IP가 고정되어야 하는 경우에 유용하다.

6.1 Windows에서 MAC 주소 변경 (테스트용)

실제 MAC 주소 대신 테스트용 임의 주소로 변경해서 예약 동작을 확인한다.

`실행(Win+R) → ncpa.cpl → Ethernet0 우클릭 → 속성 → 구성 → 고급 → Locally Administered Address → 값 체크 → 주소 입력 → 확인`

[캡처 - Locally Administered Address 값 입력 화면]

- Windows 10: `000000000001`
- Windows 11: `000000000002`

변경 후 `ipconfig /all`에서 MAC 주소가 바뀐 것을 확인할 수 있다.

6.2 dhcpd.conf에 예약 추가

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

[캡처 - dhcpd.conf 예약 설정 완료 화면]

> MAC 주소 구분자를 `-`로 복사한 경우 `:`으로 바꿔야 한다.  
> vi에서 `11s/-/:/g` 명령어로 해당 줄의 `-`를 모두 `:`으로 치환할 수 있다.

6.3 서비스 재시작 및 확인

[캡처 - 예약 IP(10.0.0.101, 10.0.0.201) 할당 확인]

```bash
systemctl restart dhcpd
```

Win10/11에서 `ipconfig /release` 후 `ipconfig /renew`를 실행하면 예약한 IP로 할당되는 것을 확인할 수 있다.

---

## 7. 정리 및 초기화

DHCP 서비스 중지

```bash
systemctl stop dhcpd
```

DHCP 서버 삭제

```bash
dnf autoremove -y dhcp-server
rm -rf /etc/dhcp/ /var/lib/dhcpd
```

> `autoremove`는 dhcp-server와 함께 설치됐지만 더 이상 필요하지 않은 의존성 패키지도 함께 제거한다.

---

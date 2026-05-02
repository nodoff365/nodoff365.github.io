##### 1. Server-Client Model
###### 1.1 Server: 무엇인가를 Service하는 정보시스템
###### 1.2 Client: Server가 Service하는 무엇인가를 제공받는 정보시스템
###### 1.3 무엇?
1.3.1 DHCP(Dynamic Host Configuration Protocol): 
- IP자동할당
- IP 자원의 효율적인 관리
- Protocol: UDP
- Port
	- server: 67
	- client: 68
- 초기 동작 구조(Broadcast)
	- Discover: DHCP client가 DHCP 서버를 찾는 메세지를 Network 전체에 전송
	- Offer: 최초 서비스는 하는 IP Address, Subnetmask, 서버주소, 임대시간, (DNS, Gateway)
	- Request: 해당 IP 사용여부를 다시 한 번 확인
	- ACK: 최종 서비스할 IP Address, Subnetmask, 서버주소, 임대시간, (DNS, Gateway)

1.3.2 FTP: 대용량 파일 전송
1.3.3 WEB: WEB CONTENTS 제공
1.3.4 DNS: URL을 IP Address로 변환
1.3.5 Mail: 전자 메일
1.3.6 NFS: 파일 시스템을 네트워크를 통해서 제공

리눅스
1. 기본 명령어: ls, cd
2. 설정 파일 위치
3. VI 편집기

**Port Ranges Context:**
- **Well-known Ports:** 0 – 1023
20(data), 21(control) FTP
22 SSH
23 Telnet
25 SMTP
110 POP
143 IMAP
139, 445 윈도우 문제시 대부분
443
900 992 993 995
3306

- **Registered Ports:** 1024 – 49151
- **Dynamic/Private Ports:** 49152 – 65535

---
##### 2. Rocky DHCP 서버 구성
```shell
# rocky9-1
dnf install -y dhcp-server # 의존성 파일까지 설치

dnf autoremove -y dhcp-server # 의존성 파일까지 삭제
rm -rf /var/lib/dhcpd/ /etc/dhcp/ # dhcp 설정 파일 2개 삭제

vi /etc/dhcp/dhcpd.conf # 수정
:$r /usr/share/doc/dhcp-server/dhcpd.conf.example
# 문서 맨 끝에 첨부
:1,51d (enter) # 1~51번재 줄 삭제
:10,28d # 10~28번째 줄 삭제
:14,$d # 14~마지막 줄 삭제

:se nu # 줄 번호
:se nonu # 줄 번호 취소 

#필요한 부분만 남긴 후 아래와 같이 설정
```

`설정 예시`
![[Pasted image 20260427125305.png]]

`vi /etc/dhcp/dhcpd.conf 필요 부분만 남기고 수정`
![[스크린샷 2026-04-27 112730.png]]

`vi /etc/dhcp/dhcpd.conf 수정 후 dhcp 실행`
```shell
systemctl start dhcpd # dhcpd 실행, 재부팅하면 꺼짐
systemctl enable --now dhcpd # 시스템 재부팅해도 자동 실행

systemctl stop dhcpd
systemctl status dhcpd
systemctl restart dhcpd

journalctl -xe # 오류 메세지 시 확인/종료는 q
----------------------------------------------------------------------------
cp /etc/dhcp/dhcpd.conf /etc/dhcp/dhcpd.conf.bak

cp /usr/share/doc/dhcp-server/dhcpd.conf.example /etc/dhcp/dhcpd.conf

mv /etc/dhcp/{dhcpd.conf.bak,dhcpd.conf}
```

```shell
# Win10, 11에서 DHCP, DNS 자동으로 설정 후
ipconfig /all
ipconfig /release
ipconfig /renew

# DHCP 서비스를 종료하고 다시 ip를 받으면 APIPA로 받아짐
# Gateway 없어서 내부통신은 가능
APIPA 169.254.177.151
```

`DHCP 예약 : MAC주소에 IP 지정 가능`
![[스크린샷 2026-04-27 121748.png]]

맥주소 변경
실행(ncpa.cpl)/이더넷0우클릭(속성)/구성/고급/Locally administered address/값/00000000001(0을11개)/확인

`vi /etc/dhcp/dhcpd.conf 변경`
![[스크린샷 2026-04-27 122738.png]]

##### 3. vi 명령어
```shell
vi 명령어
:숫자 # se nu 몇 번째 줄
:1,51d enter # 1~51번재 줄 삭제
:10,28d # 10~28번째 줄 삭제
:14,$d # 14~마지막 줄 삭제
u # undo, 이전 상태로 되돌림
ctrl+r # redo, u로 되돌린 것을 다시 앞으로 적용
:!ls -al # 편집기에서 명령어 실행, enter 누르면 다시 복귀
:$r !ls -al # 문서 끝에 명령어 실행 결과 붙여넣기
:!bash
:./-/:/g # .은 현재줄 or :11 11번째줄
:15s/-/:/g # 15번째 줄 -를 :로 끝까지 치환
:10,13co$ # 10~13 복사해서 파일 끝 추가 / $대신 숫자하면 그줄에 붙임

입력모드 
i 커서 한칸 앞으로
I 커서 현재줄 젤 앞으로 이동
a 커서 한칸 뒤로
A 커서 현재줄 젤 끝으로 이동
o 아래로 한줄
O 위로 한줄
s 1글자 지우면서 변경
S 현재줄 다 지우면서 변경
```

windows server 2022 설치


costom(next) next iwill(next) guest operationg system/version 지정(next)
이름로케이션지정(next) BIOS(next) processors/perprocessors(next) 메모리4096(next) NAT(next) LSI LOgic SAS(next) NVMe(next) create a new virtual disk(next) 60G/single file(next) next Custom~ (finsh) ios파일넣기


다음 지금설치 제품키가없음 datacenter(데스트톱환경)다음 라이선스체크(다음) 서버운영체제설치 다음

설정 사용자 지점 암호It1 마침

1.호스트네임지정
2.vmware tool 설치
3.전원옵션
4.서비스 윈도우 업데이트 막기
services.msc w로 정렬
Windows Update(시작유형 사용안함
서비스상태 중지)
로그온 찾아보기 고급 지금찾기 Guest 확인 확인 암호(It1) 확인

5.ip설정
10.0.0.21
10.0.0.254
168.126.63.1
8.8.8.8
6.방화벽 인바운드 파일및프린터공유(에코요청icmpipv4 허용
7.그후 full클론


---
윈도우는 복제후 sid 충돌을 방지하기위해 하드웨어 초기화를 해야하며 밑이 그 과정이다
cmd 
whoami /all`
sid값 확인

실행 - sysprep - sysprep클릭 -시스템 OOBB(첫실행~)일반화체크 - 종료옵션(시스템 종료) -확인

---

w2k22-ad
서버 관리자-로컬 서버-관리-역할및기능추가-다음-역할기반또는기능기반설치(다음)-다음-DHCP서버(기능추가)다음-다음-다음-설치-DHCP 구성 완료-커밋-닫기-닫기

서버관리자-도구-dhcp-ipv4우클릭(새범위)-다음-이름,설명지정(다음)-10.0.0.1/10.0.0.254/24(다음)-10.0.0.1/10.0.0.30(추가),10.0.0.251/10.0.0.254(추가),다음-2시간(다음)-다음-10.0.0.254(추가)다음-부모도메인(gmseo.local)다음-다음-다음-마침

예약-새예약-주소임대(예약비활성)확인-w10,w11 에서 ipconfig /renew 하고 예약 활성화된거 F5로 확인
![[스크린샷 2026-04-27 154302.png|413]]

```text
1.
서버관리자(로컬서버) - 도구 - DHCP - 범위(삭제)

2.
서버관리자(로컬서버) - 관리 - 역할 및 기능 제거 - 다음 - 다음 - DHCP서버 체크해제(기능제거) 후 다음 - 다음 - 제거 - 닫기
```

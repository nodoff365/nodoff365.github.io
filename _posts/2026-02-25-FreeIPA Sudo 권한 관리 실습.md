## 1. FreeIPA 기반 sudo 권한 적용 흐름의 핵심 단계와 단계별 명령어 정리

```bash
# 전체 흐름 요약
sudocmd 생성
  → sudocmdgroup 생성 및 명령어 포함
    → sudorule 생성 및 그룹/사용자/호스트 연결
      → SSSD 캐시 갱신
        → sudo 실행 시 정책 적용
```
### 1.1 sudocmd - 허용할 명령 정의
- 목적
sudo로 허용할 "개별 명령 경로" 등록

- 형식
```bash
ipa sudocmd-add [명령어경로] #반드시 절대경로 사용

# 확인
ipa sudocmd-find  
ipa sudocmd-show [명령어경로]
```
### 1.2 sudocmdgroup – 명령어 그룹 생성
- 목적
여러 명령을 하나의 그룹으로 묶어 관리

- 형식
```bash
# 그룹 생성
ipa sudocmdgroup-add [명령그룹이름]

# 명령 추가
ipa sudocmdgroup-add-member [명령그룹이름] --sudocmds=[명령어경로]

# 확인
ipa sudocmdgroup-find  
ipa sudocmdgroup-show [명령그룹이름]

```
### 1.3 sudorule – 실제 sudo 정책 생성
- 목적
누가 / 어디서 / 어떤 명령을 실행할 수 있는지 정의

- 형식
```bash
# 룰 생성
ipa sudorule-add [룰이름]

# 사용자 그룹 연결
ipa sudorule-add-user [룰이름] --groups=[사용자그룹이름]
ipa sudorule-add-user [룰이름] --users=[사용자이름] # 개별 사용자 연결

# 호스트 지정
ipa sudorule-add-host [룰이름] --hostcat=all # 모든 호스트 허용
ipa sudorule-add-host [룰이름] --hostgroups=[호스트그룹이름] # 특정 호스트 그룹 지정

# 명령 그룹 연결
ipa sudorule-add-allow-command [룰이름] --sudocmdgroups=[명령그룹이름]

# 확인
ipa sudorule-find
ipa sudorule-show [룰이름]

# 룰 활성/비활성 제어  
ipa sudorule-enable [룰이름]  
ipa sudorule-disable [룰이름]
```
### 1.4 SSSD 캐시 갱신
IPA 서버에 정책을 만들어도, 클라이언트는 SSSD 캐시를 통해 정책을 읽는다
```bash
# 서버에서 설정 후 클라이언트에서 실행
sss_cache -E
systemctl restart sssd
```
### 1.5 sudo 실행

```bash
# 클라이언트에서 실행
sudo -l
```

## 2. 실습
### 2.1 리눅스 명령어 useradd 만 sudo 허용
- 목표: user01, ug-ops 그룹, 모든 호스트, `/usr/sbin/useradd`만 허용

```bash
# 사용자 계정 생성
ipa user-add user01 --first=User --last=One --password

# 그룹 구성
ipa group-add ug-ops
ipa group-add-member ug-ops --users=user01

# sudo 명령 정의
ipa sudocmd-add /usr/sbin/useradd

# 명령 그룹  
ipa sudocmdgroup-add scg-user-mgmt-mini
ipa sudocmdgroup-add-member scg-user-mgmt-mini --sudocmds=/usr/sbin/useradd
  
# sudo rule
ipa sudorule-add sr-all-ops-useradd
ipa sudorule-add-user sr-all-ops-useradd --groups=ug-ops
ipa sudorule-add-host sr-all-ops-useradd --hostcat=all
ipa sudorule-add-allow-command sr-all-ops-useradd --sudocmdgroups=scg-user-mgmt-mini
```

```bash
# 검증
sudo sss_cache -E  
sudo systemctl restart sssd  
  
su - user01  
sudo -l  
sudo /usr/sbin/useradd test1 # 허용  
sudo /usr/bin/dnf install -y vim # 거부
```

### 2.2 특정 서버에서 journalctl만 허용
- 목표: user02, ug-audit 그룹, bastion.kcci.edu, `/usr/bin/journalctl`

```bash
ipa user-add user02 --first=User --last=Two --password

ipa group-add ug-audit
ipa group-add-member ug-audit --users=user02

ipa sudocmd-add /usr/bin/journalctl

ipa sudocmdgroup-add scg-logread-mini
ipa sudocmdgroup-add-member scg-logread-mini --sudocmds=/usr/bin/journalctl

ipa sudorule-add sr-all-audit-journal
ipa sudorule-add-user sr-all-audit-journal --groups=ug-audit
ipa sudorule-add-host sr-all-audit-journal --hosts=bastion.kcci.edu
ipa sudorule-add-allow-command sr-all-audit-journal --sudocmdgroups=scg-logread-mini
```

```bash
# 검증
sudo sss_cache -E
sudo systemctl restart sssd

su - user02
sudo -l
sudo /usr/bin/journalctl -xe        # 허용
sudo /usr/bin/systemctl restart sshd # 거부
```
### 2.3 특정 호스트그룹에서 systemctl 허용
- 목표: user03, ug-sre, hg-was-mysql (was.kcci.edu, mysql.kcci.edu), `/usr/bin/systemctl`

```bash
ipa user-add user03 --first=User --last=Three --password

ipa group-add ug-sre
ipa group-add-member ug-sre --users=user03

ipa hostgroup-add hg-was-mysql 
ipa hostgroup-add-member hg-was-mysql --hosts={was.kcci.edu,mysql.kcci.edu}

ipa sudocmd-add /usr/bin/systemctl

ipa sudocmdgroup-add scg-svc-mini
ipa sudocmdgroup-add-member scg-svc-mini --sudocmds=/usr/bin/systemctl

ipa sudorule-add sr-was-mysql-systemctl
ipa sudorule-add-user sr-was-mysql-systemctl --groups=ug-sre  
ipa sudorule-add-host sr-was-mysql-systemctl --hostgroups=hg-was-mysql  
ipa sudorule-add-allow-command sr-was-mysql-systemctl --sudocmdgroups=scg-svc-mini
```

```bash
# 검증
# 호스트그룹 멤버 서버에서
sudo sss_cache -E  
sudo systemctl restart sssd  
  
su - user03  
sudo -l  
sudo /usr/bin/systemctl status sshd # 허용

# 그룹 외 서버에서
sudo /usr/bin/systemctl status sshd # 거부
```
### 2.4 네트워크 진단 최소 세트(ip, ss)
- 목표: user04, ug-netops, hg-mysql-bastion, ip, ss만 허용

```bash
ipa user-add user04 --first=User --last=Four --password

ipa group-add ug-netops  
ipa group-add-member ug-netops --users=user04

ipa hostgroup-add hg-mysql-bastion
ipa hostgroup-add-member hg-mysql-bastion --hosts={mysql.kcci.edu,bastion.kcci.edu}

ipa sudocmd-add /usr/sbin/ip
ipa sudocmd-add /usr/sbin/ss

ipa sudocmdgroup-add scg-netdiag-mini
ipa sudocmdgroup-add-member scg-netdiag-mini --sudocmds=/usr/sbin/ip  
ipa sudocmdgroup-add-member scg-netdiag-mini --sudocmds=/usr/sbin/ss

ipa sudorule-add sr-all-netops-netdiag
ipa sudorule-add-user sr-all-netops-netdiag --groups=ug-netops  
ipa sudorule-add-host sr-all-netops-netdiag --hostgroups=hg-mysql-bastion  
ipa sudorule-add-allow-command sr-all-netops-netdiag --sudocmdgroups=scg-netdiag-mini
```

```bash
# 검증
sudo sss_cache -E  
sudo systemctl restart sssd  
  
su - user04  
sudo -l  
sudo /usr/sbin/ip a  
sudo /usr/sbin/ss -lntp  
sudo /usr/bin/journalctl -xe   # 거부
```
### 2.5 NOPASSWD
- 목표: user05, ug-helpdesk, 모든 호스트, journalctl NOPASSWD

```bash
ipa user-add user05 --first=User --last=Five --password

ipa group-add ug-helpdesk 
ipa group-add-member ug-helpdesk --users=user05

ipa sudocmd-add /usr/bin/journalctl

ipa sudocmdgroup-add scg-helpdesk-log  
ipa sudocmdgroup-add-member scg-helpdesk-log --sudocmds=/usr/bin/journalctl

ipa sudorule-add sr-all-helpdesk-log-nopw
ipa sudorule-add-user sr-all-helpdesk-log-nopw --groups=ug-helpdesk  
ipa sudorule-add-host sr-all-helpdesk-log-nopw --hostcat=all  
ipa sudorule-add-allow-command sr-all-helpdesk-log-nopw --sudocmdgroups=scg-helpdesk-log

# NOPASSWD 설정
ipa sudorule-add-option sr-all-helpdesk-log-nopw --sudooption='!authenticate'
```

```bash
# 검증
sudo sss_cache -E  
sudo systemctl restart sssd  
  
su - user05  
sudo -l  
sudo /usr/bin/journalctl -n 50 # 비밀번호 없이 실행
```
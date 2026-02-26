## 1. FreeIPA 기반 HBAC 접근통제 적용 흐름의 핵심 단계와 단계별 명령어 정리
```bash
hbacrule 생성
  → hbacrule에 사용자/그룹 연결
    → hbacrule에 호스트/호스트그룹 연결
      → hbacrule에 서비스 연결
        → (선택) deny 타입 지정
          → SSH/로그인 시 HBAC 정책 평가 및 적용
```
### 1.1 hbacrule 생성
- 형식
```bash
ipa hbacrule-add [룰이름]

# 확인
ipa hbacrule-find  
ipa hbacrule-show [룰이름]
```
### 1.2 사용자 / 그룹 연결

```bash
# 개별 사용자
ipa hbacrule-add-user [룰이름] --users=[사용자명]
# 사용자 그룹
ipa hbacrule-add-user [룰이름] --groups=[사용자그룹명]
# 모든 사용자
ipa hbacrule-mod [룰이름] --usercat=all

# 확인
ipa hbacrule-find  
ipa hbacrule-show [룰이름]
```
### 1.3 호스트 연결

```bash
# 개별 호스트
ipa hbacrule-add-host [룰이름] --hosts=[호스트FQDN]

# 호스트 그룹
ipa hbacrule-add-host [룰이름] --hostgroups=[호스트그룹명]

# 모든 호스트
ipa hbacrule-mod [룰이름] --hostcat=all

# 확인
ipa hbacrule-find  
ipa hbacrule-show [룰이름]
```
### 1.4 서비스 연결

```bash
# 개별 서비스
ipa hbacrule-add-service [룰이름] --hbacsvcs=[서비스명]

# 모든 서비스

ipa hbacrule-mod [룰이름] --servicecat=all

# 확인
ipa hbacrule-find  
ipa hbacrule-show [룰이름]
```
### 1.5 Rule 타입 설정(기본값: allow)

```bash
# Allow 명시
ipa hbacrule-mod [룰이름] --type=allow

# Deny 설정
ipa hbacrule-mod [룰이름] --type=deny

# 확인
ipa hbacrule-find  
ipa hbacrule-show [룰이름]
```
## 2. 실습
### 2.1
- 구성 조건

| hbac 이름           | 그룹        | Bastion | Web    | WAS    | MySQL  |
| ----------------- | --------- | ------- | ------ | ------ | ------ |
| admins_all        | admins    | SSH 허용  | SSH 허용 | SSH 허용 | SSH 허용 |
| nova_all          | nova      | SSH 허용  | SSH 허용 | SSH 허용 | SSH 허용 |
| professor_bastion | professor | SSH 허용  | SSH 불가 | SSH 불가 | SSH 불가 |
| student_deny_all  | students  | 접근 불가   | 접근 불가  | 접근 불가  | 접근 불가  |
```bash
ipa hbacrule-add admins_all
ipa hbacrule-add-user admins_all --groups=admins
ipa hbacrule-add-host admins_all --hostgroups=all_hosts
ipa hbacrule-add-service admins_all --hbacsvcs=sshd
```

```bash
ipa hbacrule-add nova_all
ipa hbacrule-add-user nova_all --groups=nova
ipa hbacrule-add-host nova_all --hostgroups=all_hosts
ipa hbacrule-add-service nova_all --hbacsvcs=sshd
```

```bash
ipa hbacrule-add professor_bastion
ipa hbacrule-add-user professor_bastion --groups=professor
ipa hbacrule-add-host professor_bastion --hosts=bastion.kcci.edu
ipa hbacrule-add-service professor_bastion --hbacsvcs=sshd
```

```bash
ipa hbacrule-add student_deny_all
ipa hbacrule-add-user student_deny_all --groups=students
ipa hbacrule-add-host student_deny_all --hostgroups=all_hosts
ipa hbacrule-add-service student_deny_all --hbacsvcs=
```
### 2.2 Web 서버 SSH 접근 제한
- 목표
	- `web_ssh_only` HBAC Rule 생성 
	- `professor` 그룹 사용자만 
	- `web.kcci.edu` 서버에 
	- `ssh` 서비스로만 접속 허용

```bash
ipa hbacrule-add web_ssh_only
ipa hbacrule-add-user web_ssh_only --groups=professor
ipa hbacrule-add-host web_ssh_only --hosts=web.kcci.edu
ipa hbacrule-add-service web_ssh_only --hbacsvcs=sshd
```
### 2.3 WAS 접근만 허용
- 목표
	- `was_ssh_only` 규칙 생성 
	- `admins` 그룹 사용자만 
	- `was.kcci.edu` 서버에 
	- ssh 허용

```bash
ipa hbacrule-add was_ssh_only
ipa hbacrule-add-user was_ssh_only --groups=admins
ipa hbacrule-add-host was_ssh_only --hosts=was.kcci.edu
ipa hbacrule-add-service was_ssh_only --hbacsvcs=sshd
```
### 2.4 DB 서버는 DBA 그룹만 접근
- 목표
	- `mysql_ssh_only` 규칙 생성 
	- dba 그룹만 (사용자 계정 dba01, dba02, dba03, dba04, dba05)
	- mysql.kcci.edu 서버에 ssh 허용

```bash
ipa group-add dba

ipa user-add dba01 --first=DBA --last=One --password < /root/user_pass.txt
ipa user-add dba02 --first=DBA --last=Two --password < /root/user_pass.txt
ipa user-add dba03 --first=DBA --last=Three --password < /root/user_pass.txt
ipa user-add dba04 --first=DBA --last=Four --password < /root/user_pass.txt
ipa user-add dba05 --first=DBA --last=Five --password < /root/user_pass.txt

ipa group-add-member dba --users={dba01,dba02,dba03,dba04,dba05}

ipa hbacrule-add mysql_ssh_only  
ipa hbacrule-add-user mysql_ssh_only --groups=dba  
ipa hbacrule-add-host mysql_ssh_only --hosts=mysql.kcci.edu  
ipa hbacrule-add-service mysql_ssh_only --hbacsvcs=sshd
```
### 2.5 전체 서버 접근 기본 Deny 후 최소 허용 정책 설계
- 목표
	- 모든 기존 allow_all HBAC rule 제거
	- 서버별 최소 접근 정책 재설계

- 구성 조건

| hbac 이름          | 서버               | 허용 그룹        | 서비스 |
| ---------------- | ---------------- | ------------ | --- |
| web_ssh_only     | web.kcci.edu     | professor    | ssh |
| was_ssh_only     | was.kcci.edu     | admins       | ssh |
| mysql_ssh_only   | mysql.kcci.edu   | dba          | ssh |
| bastion_ssh_only | bastion.kcci.edu | admins, nova | ssh |
```bash
# web_ssh_only
ipa hbacrule-add web_ssh_only
ipa hbacrule-add-user web_ssh_only --groups=professor
ipa hbacrule-add-host web_ssh_only --hosts=web.kcci.edu
ipa hbacrule-add-service web_ssh_only --hbacsvcs=sshd
```

```bash
# was_ssh_only
ipa hbacrule-add was_ssh_only
ipa hbacrule-add-user was_ssh_only --groups=admins
ipa hbacrule-add-host was_ssh_only --hosts=was.kcci.edu
ipa hbacrule-add-service was_ssh_only --hbacsvcs=sshd
```

```bash
# mysql_ssh_only
ipa hbacrule-add mysql_ssh_only
ipa hbacrule-add-user mysql_ssh_only --groups=dba
ipa hbacrule-add-host mysql_ssh_only --hosts=mysql.kcci.edu
ipa hbacrule-add-service mysql_ssh_only --hbacsvcs=sshd
```

```bash
# astion_ssh_onl
ipa hbacrule-add bastion_ssh_only  
ipa hbacrule-add-user bastion_ssh_only --groups=admins --groups=nova  
ipa hbacrule-add-host bastion_ssh_only --hosts=bastion.kcci.edu  
ipa hbacrule-add-service bastion_ssh_only --hbacsvcs=sshd
```

```bash
# 검증
ipa hbactest --user=prof01 --host=was.kcci.edu --service=ssh
ipa hbactest --user=admin --host=bastion.kcci.edu --service=ssh
```
---
title: "Azure 클라우드 데이터 및 App 보안"
date: 2026-06-08 00:00:00 +0900
categories: [Project, Azure]
tags: [azure, security, rbac, pim, key-vault, nsg, waf, defender-for-cloud, jit, terraform, defense-in-depth]
---

## 1. 개요

Azure 클라우드 환경의 **데이터 및 애플리케이션 보안**을 심층 방어(Defense in Depth) 관점에서 구축·검증한 프로젝트입니다. "공격자가 침투하지 못하도록 각 계층이 실제로 잘 막고 있는가"를 확인하기 위해, 통제를 적용하기 전 공격이 도달하는 것을 확인하고 통제 적용 후 차단·완화되는 것을 **Before/After**로 검증하는 방식으로 진행했습니다.

보안 통제는 **ID·거버넌스 → 플랫폼 보호 → 데이터·자격증명 보호 → 위협 보호** 4계층으로 나누어 구성했고, 대부분의 통제를 Terraform(IaC)으로 코드화해 재현 가능하게 관리했습니다. 대상 환경은 Rocky Linux 9 + Apache + WordPress 웹 서버와 내부 DB로 구성됩니다.

**기술 스택**

`Terraform (IaC)` · `Entra ID (RBAC · Custom Role · MFA · PIM)` · `Azure Policy` · `NSG · VNet Flow Log` · `Application Gateway WAF · Azure Firewall` · `Key Vault · Managed Identity · Disk Encryption Set` · `Microsoft Defender for Cloud · JIT` · `Purview DLP`

**기간** 2026.5.20 ~ 6.8

![전체 구성도](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/architecture.png)
_대상 환경 전체 구성도_

<br>

---

<br>

## 2. ID · 거버넌스

### 2.1 최소 권한 RBAC (사용자 정의 역할)

직무별 최소 권한 원칙에 따라 VM 운영·모니터링·네트워크 세 가지 사용자 정의 역할을 Terraform으로 정의했습니다. 검증 과정에서, 권한이 부족한 계정(Contributor만 상속)으로는 역할 정의 생성이 **403 Forbidden**으로 거부되었고, 충분한 권한(Owner) 환경에서 동일 코드를 적용하자 3종 역할이 정상 생성·할당되었습니다. 권한이 없으면 거부, 있으면 설계대로 생성 — 직무 분리와 최소 권한 설계가 함께 검증된 것입니다.

![RBAC 권한 부족 403](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/rbac-403.png)
_역할 정의 생성 시도 → 403 Forbidden (권한 부족)_

![사용자 정의 역할 3종 생성](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/rbac-roles-created.png)
_충분한 권한 환경에서 3종 커스텀 역할 생성·RG 범위 할당_

### 2.2 Azure Policy (배포 제어)

허용 리전 제한과 필수 태그 강제 정책을 정의했습니다. 권한 부족 환경에서는 정책 할당이 403으로 거부되고, Owner 환경에서 두 정책이 정상 할당됨을 확인했습니다.

![정책 할당 403](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/policy-403.png)
_정책 할당 시도 → 403 Forbidden_

![정책 정상 할당](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/policy-applied.png)
_필수 태그 강제·허용 리전 제한 정책 할당_

### 2.3 다단계 인증 (MFA)

ID·비밀번호 단일 인증은 자격증명 탈취에 취약하므로 보안 기본값(Security Defaults)으로 MFA를 적용했습니다. 로그인 시 Authenticator 번호 일치 방식의 MFA가 요구되고, 로그인 로그에 MFA 성공이 기록됨을 확인했습니다.

![Authenticator MFA 요구](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/mfa-authenticator.png)
_로그인 시 Authenticator 번호 일치 MFA 요구_

![로그인 로그 MFA 성공](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/mfa-login-log.png)
_로그인 로그: 인증 정책·MFA 성공 기록_

### 2.4 권한의 시간적 최소화 (PIM)

상시 권한 대신, 필요할 때만 승인을 거쳐 일시적으로 권한을 활성화하는 PIM을 적용했습니다. 활성화 정책에 MFA·사유·승인을 필수로 걸었습니다. 승격 전에는 사용자 생성이 거부되고, 승격을 요청해 승인자가 승인하면 역할이 활성화되어 사용자 생성이 성공했습니다. 요청·승인·활성화 전 과정이 감사 로그에 남습니다.

![Before: 승격 전 거부](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/pim-before-deny.png)
_승격 전 — 사용자 생성 시도 거부_

![승인 후 활성화·생성 성공](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/pim-after-success.png)
_After: 승인 후 활성 상태 → 사용자 생성 성공_

![PIM 감사 로그](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/pim-audit-log.png)
_요청·승인·활성화 전 과정 감사 로그 기록_

### 2.5 거버넌스 변경 탐지

역할 할당·정책·NSG 같은 보안상 민감한 변경을 탐지 대상으로 삼아 경고 규칙을 구성했습니다. NSG를 변경하자 활동 로그에 기록되고 경고가 Fired 상태로 발생하며 알림 이메일이 수신됨을 확인했습니다.

![경고 발생(Fired)](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/gov-alert-fired.png)
_NSG 변경 → alert-nsg-change 발생(Fired)_

![탐지 알림 이메일](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/gov-alert-email.png)
_탐지 알림 이메일 수신_

<br>

---

<br>

## 3. 플랫폼 보호

### 3.1 NSG 계층 차단 (Lateral Movement 방지)

Web·DB 서브넷에 전용 NSG를 두어 계층 간 불필요한 통신을 차단했습니다. Before/After로 실제 공격을 검증했습니다.

**SSH 무차별 대입** — 통제 전에는 hydra의 SSH 접근이 서버에 도달했으나, NSG 적용 후 차단됩니다.

![Before: SSH 무차별 대입 도달](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/nsg-ssh-before.png)
_통제 전 — hydra SSH 접근이 서버에 도달_

![After: SSH 접근 차단](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/nsg-ssh-after.png)
_NSG 적용 후 — hydra SSH 접근 차단_

**포트 스캔** — 통제 전에는 nmap 포트 스캔이 노출 포트를 식별했으나, NSG 적용 후 차단됩니다.

![Before: nmap 포트 스캔 도달](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/nsg-nmap-before.png)
_통제 전 — nmap 포트 스캔이 서버에 도달_

![After: 포트 스캔 차단](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/nsg-nmap-after.png)
_NSG 적용 후 — nmap 포트 스캔 차단_

VNet Flow Log로 네트워크 레벨의 허용/거부를 교차 검증했고, 차단 이후에도 정상 통신 경로(Web→DB)는 유지되어 계층 통제가 정상 트래픽에는 영향을 주지 않음을 확인했습니다.

![Flow Log 차단 기록](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/flowlog-denied.png)
_VNet Flow Log — 차단 트래픽 Denied 기록_

![정상 경로 유지](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/nsg-normal-path.png)
_정상 경로(Web→DB) 통신 허용 유지_

### 3.2 웹 애플리케이션 공격 노출 진단

NSG 차단만으로는 L7 웹 공격을 통제할 수 없으므로, 웹 애플리케이션 자체의 노출 수준을 외부 공격자(Kali) 관점에서 진단했습니다. wpscan으로 계정·업로드 디렉터리 노출, nikto로 TRACE·디렉터리 인덱싱·버전 노출·보안 헤더 누락, sqlmap으로 SQL Injection 노출을 확인해 애플리케이션 계층 보호(WAF)와 호스트 하드닝(Apache)의 필요성을 진단했습니다.

![wpscan 진단](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/wpscan.png)
_wpscan: admin 계정 열거·업로드 디렉터리 노출_

![nikto 진단](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/nikto.png)
_nikto: TRACE·디렉터리 인덱싱·버전 노출·헤더 누락_

![sqlmap 진단](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/sqlmap.png)
_sqlmap: SQL Injection 노출 및 WAF 적용 권고_

<br>

---

<br>

## 4. 데이터 · 자격증명 보호

### 4.1 Key Vault 자격증명 외부화

기존 WordPress(`wp-config.php`)에는 DB 비밀번호가 평문으로 하드코딩되어 있었습니다. 이를 Key Vault로 외부화했습니다. Key Vault를 Access Policy 모델로 구성하고 DB 자격증명 3종을 시크릿으로 저장했습니다.

![평문 하드코딩(Before)](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/wpconfig-plaintext.png)
_wp-config.php에 DB 비밀번호 평문 하드코딩_

![시크릿 저장(After)](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/kv-secrets-stored.png)
_Key Vault에 DB 자격증명 3종 저장_

### 4.2 Managed Identity (자격증명 없는 접근)

VM에 System-assigned Managed Identity를 부여해, 코드에 자격증명을 두지 않고 IMDS로 토큰을 획득하여 Key Vault 시크릿을 조회하도록 했습니다. `wp-config.php`는 DB 비밀번호를 Key Vault에서 동적으로 조회하도록 바꿨고, 연동 후 WordPress가 정상 동작함을 확인했습니다.

![IMDS 토큰·KV 조회](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/mi-imds-token.png)
_Web VM에서 IMDS 토큰 획득 및 Key Vault Secret 조회_

![KV 연동 후 정상 동작](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/wp-normal.png)
_Key Vault 시크릿 연동 후 WordPress 정상 동작_

### 4.3 디스크 암호화 (Disk Encryption Set)

VM OS 디스크를 고객 관리 키(CMK) 기반 Disk Encryption Set으로 암호화했습니다. Bastion·DB·Web VM OS 디스크 3개에 적용해, 물리 디스크가 탈취되어도 키 없이는 복원할 수 없도록 했습니다.

![CMK 기반 암호화 적용](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/des-cmk-applied.png)
_Web VM OS 디스크 — CMK 기반 SSE(DES) 적용 확인_

![EncryptionAtRest 확인](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/des-encryption-atrest.png)
_Bastion·DB·Web OS 디스크 EncryptionAtRest 적용_

### 4.4 스토리지 보안

스토리지에 HTTPS 강제·TLS 1.2·Blob 공개 접근 차단을 적용하고, SAS 토큰 최대 유효기간을 1일로 제한했습니다. 네트워크 기본 정책을 Deny로 두어 데이터 평면 요청이 실제로 차단됨을 확인했습니다.

![HTTPS·TLS·공개 차단](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/storage-https-tls.png)
_HTTPS 강제·TLS1.2·Blob 공개 접근 차단_

![SAS 만료 정책](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/sas-expiry.png)
_SAS 토큰 최대 유효기간 1일_

![Deny 차단](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/storage-deny-blocked.png)
_네트워크 기본 정책(Deny)에 의한 데이터 평면 요청 차단_

### 4.5 접근 로그 감사

Key Vault와 스토리지의 진단 설정을 Log Analytics로 연결해, 시크릿 조회(AuditEvent)와 Blob 접근(StorageBlobLogs) 이벤트가 수집됨을 확인했습니다.

![KV AuditEvent 수집](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/kv-auditevent.png)
_Log Analytics — Key Vault 시크릿 조회 이벤트 수집_

![StorageBlobLogs 수집](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/storageblobLogs.png)
_Log Analytics — Blob 접근 로그 수집_

앱 등록(Service Principal)에 최소 권한(Secret Get/List)만 부여해 시크릿 조회는 성공하되 구독 접근은 없는 상태를 검증했습니다.

![SP 최소 권한 시크릿 조회](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/sp-secret-read.png)
_앱 자격증명 로그인(구독 없음) → Key Vault 시크릿 조회 성공_

<br>

---

<br>

## 5. 위협 보호

### 5.1 Microsoft Defender for Cloud

Defender for Servers를 활성화하고 MDE(EDR)를 온보딩했습니다. 워크로드 보호에서 서버 2/2 전체가 보호 대상으로 등록됐고, 온보딩 전에는 EDR 미설치·비밀 평문 노출이 탐지되던 것이, 온보딩 후 VM 내부 패키지 취약점까지 자동 식별됩니다. Brute Force 공격 시도·성공도 High 등급 경고로 탐지됐습니다.

![서버 2/2 보호](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/defender-servers.png)
_워크로드 보호: 서버 2/2, 전체 검사 100%_

![평문 노출 탐지](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/defender-plaintext-detect.png)
_wp-config.php DB 비밀번호 평문 노출 탐지_

![Brute Force 경고](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/defender-bruteforce.png)
_Brute Force 시도·성공 High 등급 경고_

### 5.2 JIT (Just-in-Time VM Access)

관리 포트(SSH 22)를 상시 열지 않고, 필요할 때만 승인을 거쳐 여는 JIT를 적용했습니다. 적용 전에는 SSH가 즉시 접속됐지만, JIT 활성화 후 미요청 상태에서는 접속이 timeout으로 차단되고, 요청·승인 후에만 원본 IP에 한해 임시로 열립니다. Defender가 NSG 규칙을 자동으로 수정(Allow 100 + Deny 1000)합니다.

![Before: SSH 즉시 접속](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/jit-before-ssh.png)
_JIT 적용 전 — SSH 즉시 접속 성공_

![JIT 미요청 차단](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/jit-blocked.png)
_JIT 미요청 상태 — SSH 차단(Connection timed out)_

![승인 후 접속 성공](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/jit-after-ssh.png)
_JIT 요청·승인 후 — SSH 접속 성공_

![NSG 자동 수정](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/jit-nsg-auto.png)
_JIT 후 NSG 규칙 자동 추가 (Allow 100 + Deny 1000)_

### 5.3 Purview DLP

Purview DLP·컴플라이언스 관점에서 M365 조직 테넌트의 외부 사용자 접근 제한을 확인했습니다.

![M365 접근 제한](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/purview-m365.png)
_compliance 포털 — 테넌트 외부 사용자 접근 거부_

<br>

---

<br>

## 6. 결론

ID·거버넌스, 플랫폼 보호, 데이터·자격증명 보호, 위협 보호 4계층에 걸쳐 보안 통제를 Terraform으로 구축하고, 각 통제가 실제 공격을 차단·탐지하는지 Before/After로 검증했습니다. 통제 적용 후에도 WordPress·정상 트래픽은 그대로 동작함을 확인해, 보안 강화와 서비스 가용성을 함께 확보했습니다.

![통제 적용 후 정상 동작](https://nodoff365.github.io/assets/images/Project/azure-data-app-security/controls-normal.png)
_모든 통제 적용 후 WordPress 정상 동작_

**한계 및 개선 방향**

- **상위 라이선스 제약** — PIM·일부 Defender 고급 기능은 Entra P2/상위 플랜이 필요해 개인 테넌트에서는 부분적으로만 검증
- **Purview DLP 제한** — M365 조직 테넌트 기능이라 외부 사용자 접근 제한 수준까지만 확인
- **시크릿 자동 회전 미적용** — Key Vault 외부화는 완료했으나 정기 회전(rotation) 미구성
- **WAF 실차단 별도** — 웹 취약점은 진단으로 노출을 확인했고, WAF 실차단 검증은 인프라 프로젝트 범위에서 수행

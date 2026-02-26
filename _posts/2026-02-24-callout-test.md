---
title: "GitHub Callout 테스트"
date: 2026-02-24 10:00:00 +0900
categories: [클라우드 기초, azure]
tags: [markdown, callout, test]
---

# Callout 렌더링 테스트

기본 인용:

> 기본 blockquote 테스트 문장입니다.

GitHub callout 종류:

> [!NOTE]
> NOTE 스타일 테스트.

> [!TIP]
> TIP 스타일 테스트.

> [!IMPORTANT]
> IMPORTANT 스타일 테스트.

> [!WARNING]
> WARNING 스타일 테스트.

> [!CAUTION]
> CAUTION 스타일 테스트.

## 리스트 테스트

- 불릿 1
- 불릿 2
  - 중첩 불릿
- `inline code` 테스트

1. 번호 1
2. 번호 2
3. 번호 3

## 코드블럭 테스트

```bash
echo "hello"
az --version
```

```yaml
name: sample
on:
  workflow_dispatch:
jobs:
  test:
    runs-on: ubuntu-latest
```

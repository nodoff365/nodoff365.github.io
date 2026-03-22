---
title: "Windows에서 gcc 사용하기: MinGW-w64 환경 구축 가이드"
date: 2026-03-18 00:00:00 +0900
categories: [클라우드 기초, 시큐어 코딩]
tags: [gcc, MinGW, Windows]
---
Windows 환경에서는 기본적으로 GCC(GNU Compiler Collection)가 제공되지 않기 때문에 C/C++ 소스코드를 컴파일하려면 별도의 컴파일러 설치가 필요하다.

VS Code와 같은 에디터를 사용하더라도 실제 컴파일은 외부 컴파일러가 수행되므로, GCC 사용을 위해 Windows에서 동작 가능한 환경을 구성해야 한다.

본 글에서는 Windows에서 GCC를 사용하기 위해 MinGW-w64를 설치하고, 환경 변수(PATH)를 설정한 뒤 정상적으로 동작하는지 확인하는 과정을 정리한다.

---

## 1. MinGW-w64 다운로드 및 설치
MinGW-w64의 공식 정보는 공식 사이트(www.mingw-w64.org)에서 확인할 수 있으며, 실제 바이너리는 주로 SourceForge를 통해 배포된다.

<br>
MinGW-w64는 SourceForge 페이지(https://sourceforge.net/projects/mingw-w64/)에서 설치 파일을 다운로드하여 설치한다.
![](/assets/images/MinGW/MinGw_1.png){: style="width:75%;" }<br>


다운로드한 `mingw-get-setup`을 실행하여 설치를 진행한다.
![](/assets/images/MinGW/MinGw_2.png){: style="width:50%;" }<br>


MinGW의 설치 경로를 지정한 후 진행한다.<br>
해당 경로는 이후 환경 변수(PATH) 설정에 사용되므로 미리 확인해둔다.
![](/assets/images/MinGW/MinGw_3.png){: style="width:50%;" }<br>


설치 경로를 지정한 후 Continue를 클릭하면 다음과 같이 설치가 진행된다.
![](/assets/images/MinGW/MinGw_4.png){: style="width:50%;" }<br>


설치가 모두 완료된 후 Continue를 클릭하면 MinGW Installation Manager가 나타난다.<br>
패키지를 좌클릭 또는 우클릭 시 Mark for Installation을 선택할 수 있다.
![](/assets/images/MinGW/MinGw_5.png){: style="width:100%;" }<br>


필요한 패키지를 선택한 후 상단 메뉴에서 Installation > Apply Changes를 클릭한다.<br>
이후 Apply를 클릭하면 선택한 패키지 설치가 진행된다.
패키지 설치가 완료되면 Close를 클릭한다.
![](/assets/images/MinGW/MinGw_6.png){: style="width:100%;" }

![](/assets/images/MinGW/MinGw_7.png){: style="width:50%;" }

![](/assets/images/MinGW/MinGw_8.png){: style="width:50%;" }

![](/assets/images/MinGW/MinGw_9.png){: style="width:50%;" }<br>


**MinGW 설치 폴더의 bin 폴더**로 이동하게 되면,
아래와 같이 **g++.exe, gcc.exe**가 설치된 것을 볼 수 있다.
![](/assets/images/MinGW/MinGw_10.png){: style="width:60%;" }<br>

---

## 2. 환경 변수 설정
설치한 MinGW의 `gcc` 명령어를 Windows 어디서든 사용할 수 있도록 환경 변수(PATH)에 경로를 추가한다.<br>
<br>

시작 메뉴에서 **환경 변수**를 검색한 후, 검색 결과에서 **시스템 환경 변수 편집**을 클릭한다.
![](/assets/images/MinGW/MinGw_11.png){: style="width:40%;" }<br>


시스템 속성에서 **환경 변수**를 클릭한 후, 시스템 변수의 `Path`를 선택하고 편집을 클릭한다.
![](/assets/images/MinGW/MinGw_12.png){: style="width:75%;" }<br>


새로 만들기를 클릭한 후 MinGW의 `bin` 경로(예: `C:\mingw\bin`)를 추가한다.
![](/assets/images/MinGW/MinGw_13.png){: style="width:50%;" }<br>


CMD를 실행한 후 `gcc --version` 명령어를 입력한다.<br>
정상적으로 버전 정보가 출력되면 환경 변수 설정 및 설치가 완료된 것이다.
![](/assets/images/MinGW/MinGw_14.png){: style="width:75%;" }



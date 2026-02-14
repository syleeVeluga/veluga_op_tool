**PRD 요구사항 정의서**

고객 로그 데이터 추출 대시보드 (CSV/JSON)

필터 기반 UI × MongoDB Atlas × Vibe Coding

문서 버전: v1.2.1  |  작성일: 2026-02-14  |  상태: Draft

⚠️ 본 문서는 바이브 코딩(AI 보조 개발) 워크플로우를 전제로 작성되었습니다.

# **0\. 변경 이력**

| 버전 | 날짜 | 변경 내용 |
| :---- | :---- | :---- |
| v1.0 | 2026-02-13 | 초기 작성 (필터 기반 UI, CSV 추출, 프리셋/히스토리, RBAC 초안) |
| v1.1 | 2026-02-14 | 이메일 기반 사용자 프로비저닝(관리자 등록), 사용자별 메뉴 접근 제어, GitHub Pages 배포 가능성 검토(프론트 정적 배포), CSV 5,000자 Truncate \+ JSON 전문 다운로드 메뉴 추가 |
| v1.2 | 2026-02-14 | 데이터 조회/내보내기 시 DB 부하 최소화(가드레일, 커서 기반 페이지네이션, 스트리밍) 요구사항 추가. GitHub Pages 배포 섹션에서 Atlas App Services(Data API) EOL 반영 및 대안(Cloud Functions/Lambda 등)으로 수정. 비용 최소화 관점의 배포 옵션(서버리스/로컬 실행) 검토 추가. |
| v1.2.1 | 2026-02-14 | 배포 방식 확정: 프론트 GitHub Pages \+ 백엔드 Google Cloud Run(서버리스 컨테이너). Cloud Run 권장 설정/CI-CD/보안·운영 항목을 4.5 섹션에 상세화. |

# **1\. 프로젝트 개요**

## **1.1 배경 및 목적**

우리 서비스는 MongoDB Atlas를 데이터베이스로 사용하고 있으며, 고객으로부터 다양한 로그 데이터(AI 대화 기록, API 사용량, 이벤트 로그 등)의 CSV 추출 요청을 지속적으로 받고 있습니다. 현재는 개발자가 직접 DB에 접속하여 쿼리를 실행하고 수동으로 CSV를 생성하는 방식으로 대응하고 있어, 비효율적이며 보안 리스크가 존재합니다.

본 프로젝트는 담당자(운영/CS팀)가 웹 대시보드에서 드롭다운, 날짜 선택, 필터 등 직관적인 UI 조작만으로 고객 로그 데이터를 조회하고 CSV로 다운로드할 수 있는 셀프서비스 대시보드를 개발하는 것을 목표로 합니다. 별도의 기술적 지식(쿼리 작성 등) 없이 누구나 사용할 수 있어야 합니다.

추가로, 대화 로그처럼 텍스트가 매우 큰 경우 CSV에서 특정 필드가 과도하게 커지는 문제를 방지하기 위해 CSV 내 문자열은 기본 5,000자 기준으로 Truncate(잘라내기)하며, 필요 시 전문(원문) 데이터를 JSON으로 다운로드할 수 있는 별도 메뉴를 제공합니다.

## **1.2 핵심 가치 제안**

| 구분 | 현재 (As-Is) | 목표 (To-Be) |
| :---- | :---- | :---- |
| 데이터 추출 방법 | 개발자가 직접 DB 접속 후 쿼리 작성 | 담당자가 UI 필터로 조건 선택 후 조회 |
| 소요 시간 | 1건당 30분-2시간 | 1건당 1-3분 이내 |
| 보안 | DB 직접 접속 권한 필요 | API 기반 Read-Only 접근 \+ 사용자/메뉴 권한 통제 |
| 학습 비용 | MongoDB 쿼리 문법 필요 | 클릭 몇 번으로 완료 (Zero Learning Curve) |
| 의존성 | 개발자 일정 의존 | 담당자 자체 처리 |

## **1.3 용어 정의**

| 용어 | 설명 |
| :---- | :---- |
| MongoDB Atlas | 클라우드 기반 MongoDB 데이터베이스 서비스 |
| 바이브 코딩 (Vibe Coding) | AI가 코드 생성을 보조하는 개발 방법론 |
| 담당자 | 고객 요청을 처리하는 운영/CS팀 직원 |
| 관리자 (Admin) | 사용자 등록/권한/메뉴 접근을 관리하는 운영 관리자 |
| CSV | 콤마로 구분된 값 (Comma-Separated Values) 파일 형식 |
| JSON | 전문(원문) 로그 전달을 위한 구조화 데이터 형식 |
| 필터 패널 | 조회 조건을 설정하는 UI 영역 (드롭다운, 날짜 선택, 텍스트 검색 등) |
| 프리셋 | 자주 사용하는 필터 조합을 저장해둔 템플릿 |
| 메뉴 권한 | 사용자별로 접근 가능한 메뉴(기능/페이지)를 제한하는 권한 |
| Truncate | 문자열을 지정 길이(기본 5,000자)에서 잘라 CSV 크기를 제한하는 처리 |

# **2\. 대상 사용자 및 시나리오**

## **2.1 사용자 페르소나**

| 페르소나 | 역할 | 핵심 니즈 |
| :---- | :---- | :---- |
| 운영 담당자 | 고객 요청에 따라 로그 데이터를 추출하여 전달 | 필터 선택만으로 빠른 추출, CSV 다운로드 |
| CS 팀원 | 고객 문제 해결을 위해 로그 확인 필요 | 특정 고객의 활동 기록 빠른 조회 |
| 관리자 (Admin) | 시스템 설정 및 권한 관리 | 사용자(이메일) 등록, 메뉴/데이터 접근 권한 제어, 감사 로그 확인 |

## **2.2 핵심 사용 시나리오**

### **UC-01: 고객 대화 기록 추출 (CSV)**

1\. 담당자가 대시보드에 로그인한다.  
2\. 데이터 유형 드롭다운에서 “대화 기록”을 선택한다.  
3\. 고객 ID 또는 고객명을 검색창에 입력한다.  
4\. 날짜 범위(Date Range Picker)를 “2024-01-01 \~ 2024-01-31”로 설정한다.  
5\. “조회” 버튼을 클릭하면 테이블에 결과가 표시된다.  
6\. 결과를 확인한 후 “CSV 다운로드” 버튼을 클릭하여 파일을 받는다.  
7\. (자동) CSV 내 문자열 필드는 5,000자를 초과하면 Truncate된다.

### **UC-02: API 사용량 로그 추출 (CSV)**

1\. 데이터 유형에서 “API 사용량”을 선택한다.  
2\. 고객을 검색하고 날짜 범위를 설정한다.  
3\. (선택) 추가 필터로 endpoint, HTTP method, status code 등을 지정한다.  
4\. “조회” 버튼 클릭 → 테이블 미리보기 → CSV 다운로드.

### **UC-03: 에러 로그 추출 (CSV)**

1\. 데이터 유형에서 “에러 로그”를 선택한다.  
2\. 고객 및 기간을 설정한다.  
3\. (선택) 에러 코드, 심각도(severity) 등 추가 필터를 설정한다.  
4\. 조회 후 결과를 확인하고 CSV로 다운로드한다.

### **UC-04: 프리셋 활용**

1\. 담당자가 저장된 프리셋 목록에서 “월별 고객 A 대화 기록”을 클릭한다.  
2\. 필터 조건이 자동으로 채워진다 (고객 ID, 데이터 유형, 기간 등).  
3\. 필요 시 날짜만 변경한 후 조회 및 다운로드한다.

### **UC-05: 관리자 \- 사용자(이메일) 및 메뉴 권한 등록**

1\. 관리자가 “관리자 \> 사용자/권한 관리” 메뉴에 접속한다.  
2\. “사용자 추가”에서 이메일(필수), 이름(선택), 역할(Role), 접근 가능 메뉴(체크박스), 접근 가능 데이터 유형(체크박스)을 설정한다.  
3\. 저장하면 해당 이메일은 로그인 가능 상태가 된다.  
4\. 사용자가 로그인 시, 등록된 메뉴만 사이드바/헤더에 노출되고 접근이 허용된다.

### **UC-06: JSON 전문 다운로드 (원문)**

1\. 담당자가 사이드바에서 “JSON 전문 다운로드” 메뉴로 이동한다.  
2\. CSV 조회와 동일한 방식으로 데이터 유형/고객/기간/추가 필터를 설정한다.  
3\. “JSON 다운로드” 버튼을 클릭하면 Truncate 없이 원문이 포함된 JSON 파일이 다운로드된다.  
4\. (선택) 파일이 큰 경우 .json.gz(압축) 형태로 다운로드된다.

# **3\. 기능 요구사항**

## **3.1 필터 패널 / 데이터 조회 (Frontend 핵심)**

| ID | 기능 | 설명 | 우선순위 |
| :---- | :---- | :---- | :---- |
| F-01 | 데이터 유형 선택 | 드롭다운으로 조회할 로그 유형 선택 (대화 기록, API 사용량, 에러 로그, 이벤트 로그 등) | P0 (Must) |
| F-02 | 고객 검색 | 고객 ID 또는 고객명으로 검색. 자동완성(autocomplete) 지원 | P0 (Must) |
| F-03 | 날짜 범위 선택 | Date Range Picker로 시작일-종료일 선택. 빠른 선택: 오늘, 최근 7일, 지난달, 지난 3개월 | P0 (Must) |
| F-04 | 추가 필터 (동적) | 데이터 유형에 따라 필터 항목이 동적 변경. 예: API 로그 → endpoint, method, statusCode 필터 표시 | P0 (Must) |
| F-05 | 결과 테이블 표시 | 조회 결과를 테이블로 표시. 컬럼 정렬, 페이지네이션 지원 (미리보기 최대 100행) | P0 (Must) |
| F-06 | CSV 다운로드 | 결과 확인 후 CSV 파일로 다운로드. 파일명 자동생성 (예: conversations\_customerA\_2024-01.csv) | P0 (Must) |
| F-07 | 컬럼 선택 | 추출할 컬럼을 체크박스로 선택/해제. 기본값: 전체 선택 | P1 (Should) |
| F-08 | 프리셋 저장/불러오기 | 현재 필터 조건을 프리셋으로 저장하고 한 클릭으로 불러오기 | P1 (Should) |
| F-09 | 조회 히스토리 | 이전 조회 기록 목록 표시 및 재실행 기능 | P1 (Should) |
| F-10 | 로딩/진행 상태 | 조회 실행 중 로딩 애니메이션 및 예상 건수 표시 | P0 (Must) |
| F-11 | 다크 모드 | UI 다크/라이트 모드 지원 | P2 (Nice) |
| F-12 | 빈 상태 안내 | 결과가 없을 때 사용자 친화적 안내 메시지 표시 | P0 (Must) |
| F-13 | CSV Truncate 안내 | CSV 다운로드 시 문자열 필드가 5,000자 기준 Truncate됨을 UI에 명시 (툴팁/배너) | P0 (Must) |
| F-14 | JSON 전문 다운로드 메뉴 | Truncate 없이 원문 포함 JSON 다운로드 제공 (별도 메뉴/페이지) | P0 (Must) |
| F-15 | 메뉴 접근 제어 (사용자별) | 로그인 사용자에 따라 접근 가능한 메뉴만 노출/접근 허용 | P0 (Must) |
| F-16 | 관리자 \- 사용자/권한 관리 UI | 사용자(이메일) 등록, 메뉴 권한 편집, 비활성화 | P0 (Must) |

## **3.2 백엔드 API**

| ID | 기능 | 설명 | 우선순위 |
| :---- | :---- | :---- | :---- |
| B-01 | 쿼리 빌더 엔진 | 필터 조건(JSON)을 받아 MongoDB Aggregation Pipeline으로 변환 | P0 (Must) |
| B-02 | MongoDB 연동 | MongoDB Atlas에 Read-Only로 접속하여 쿼리 실행 | P0 (Must) |
| B-03 | 쿼리 결과 처리 | MongoDB 결과를 JSON으로 파싱하여 프론트엔드에 전달 | P0 (Must) |
| B-04 | CSV 생성 엔진 | JSON 결과를 CSV로 변환 (Nested 데이터 플랫트닝 포함) | P0 (Must) |
| B-04a | CSV Truncate 처리 | CSV 내 문자열 필드가 5,000자를 초과할 경우 잘라내기(기본값 5,000, 설정 가능) | P0 (Must) |
| B-05 | 동적 스키마 제공 | 데이터 유형 선택 시 해당 Collection의 필터 항목/컬럼 목록을 프론트엔드에 전달 | P0 (Must) |
| B-06 | 결과 페이지네이션 | 대용량 결과 페이지네이션 처리 (1회 최대 10,000건) | P0 (Must) |
| B-07 | 프리셋 CRUD | 프리셋 생성/조회/수정/삭제 API | P1 (Should) |
| B-08 | 조회 로그 저장 | 모든 조회/다운로드 기록 저장 (누가, 언제, 무엇을, 결과 건수, CSV/JSON 타입) | P1 (Should) |
| B-09 | 고객 목록 API | 고객 검색용 자동완성 API (ID, 이름 검색) | P0 (Must) |
| B-10 | 인증/인가 (이메일 기반) | 이메일을 사용자 식별자로 사용. 등록된 사용자만 로그인 가능. JWT 발급 및 RBAC/메뉴 권한 검사 | P0 (Must) |
| B-11 | 사용자 관리 CRUD (Admin) | 사용자 생성/조회/수정/비활성화, 메뉴 권한/데이터 접근 권한 설정 | P0 (Must) |
| B-12 | JSON Export 엔진 | 동일 필터 조건으로 Truncate 없이 JSON(.json 또는 .json.gz) 다운로드 제공 | P0 (Must) |
| B-13 | DB 부하 최소화 조회/내보내기 | 조회/다운로드는 인덱스 친화 쿼리(고객+기간 필수), 컬럼 프로젝션, 커서 기반 페이지네이션(seek), readPreference(가능 시 secondaryPreferred) 적용. Export는 Cursor 스트리밍으로 메모리/DB 부하 최소화 및 동시 실행 제한. | P0 (Must) |

## **3.3 데이터 유형 및 필터 매핑**

각 데이터 유형별로 필터 패널에 표시될 필터 항목이 달라집니다:

| 데이터 유형 | Collection | 공통 필터 | 전용 필터 | 우선 |
| :---- | :---- | :---- | :---- | :---- |
| 대화 기록 | conversations | 고객, 기간 | 모델명, 토큰 사용량(이상/이하) | P0 |
| API 사용량 | api\_usage\_logs | 고객, 기간 | endpoint, method, statusCode | P0 |
| 이벤트 로그 | event\_logs | 고객, 기간 | eventType | P0 |
| 에러 로그 | error\_logs | 고객, 기간 | errorCode, severity | P0 |
| 결제/빌링 | billing\_logs | 고객, 기간 | plan, status | P1 |
| 사용자 활동 | user\_activities | 고객, 기간 | action, sessionId | P1 |

* 공통 필터(고객, 기간)는 모든 데이터 유형에 항상 표시되며, 전용 필터는 데이터 유형 선택 시 동적으로 표시됩니다.  
* 사용자 권한에 따라 접근 가능한 데이터 유형(메뉴)이 제한될 수 있습니다.

# **4\. 시스템 아키텍처**

## **4.1 전체 아키텍처 구성도**

React 대시보드 UI (GitHub Pages)  →  Cloud Run (Serverless Backend API)  →  MongoDB Atlas (Read-Only)

구성 요소:

* UI: 필터 패널, 결과 테이블, CSV/JSON 다운로드 메뉴  
* Cloud Run API: 인증/인가, 쿼리 빌더, CSV/JSON 스트리밍 Export  
* MongoDB Atlas: Read-Only 조회/집계(Aggregate/Find)  
* (권장) Secret Manager: DB 연결 문자열/JWT Secret 등 민감정보 관리  
* LLM/AI 엔진 없이 백엔드가 필터 조건을 직접 MongoDB Aggregation Pipeline으로 변환합니다.

## **4.2 기술 스택**

| 계층 | 기술 | 선택 이유 |
| :---- | :---- | :---- |
| Frontend | React.js \+ TypeScript | SPA 기반 대시보드, 컴포넌트 재사용성, 타입 안전성 |
| UI 프레임워크 | Tailwind CSS \+ shadcn/ui | 빠른 UI 개발, 날짜 선택기/테이블/드롭다운 컴포넌트 내장 |
| Backend API | Node.js \+ Express \+ TypeScript | 필터 처리, 쿼리 빌드, 권한 검사, 파일(스트림) 제공 |
| DB 접근 | MongoDB Driver 또는 Mongoose | Read-Only 쿼리 실행, 스키마 관리 |
| Database | MongoDB Atlas | 기존 서비스 DB 활용 |
| 상태 관리 | React Query (TanStack Query) | 서버 상태 캐싱, 페이지네이션, 로딩 상태 관리 |
| CSV/JSON 처리 | csv-writer(또는 fast-csv) \+ gzip | 백엔드에서 CSV/JSON 스트리밍 생성 및 압축 지원 |
| 인증/인가 | 이메일 기반 로그인 \+ JWT | 이메일을 사용자 키로 사용, 관리자 등록 기반, 메뉴/역할 제어 |
| 배포(확정) | GitHub Pages(프론트) \+ Google Cloud Run(백엔드) | 프론트는 정적 배포, 백엔드는 서버리스 컨테이너로 scale to zero. 저빈도 사용 시 비용 최소화 |
| CI/CD(권장) | GitHub Actions \+ Artifact Registry \+ Cloud Run Deploy | 코드 푸시 시 자동 빌드/배포로 운영 부담 감소, 재현 가능한 배포 |
| 비밀관리(권장) | Google Secret Manager | DB 접속 정보/JWT Secret 등 민감정보를 코드/환경과 분리하여 안전하게 관리 |

## **4.3 디렉토리 구조 (바이브 코딩용)**

log-csv-dashboard/

├── frontend/                     \# React \+ TypeScript  
│   ├── src/  
│   │   ├── components/  
│   │   │   ├── FilterPanel/      \# 필터 패널 (핵심)  
│   │   │   ├── DataTable/        \# 결과 테이블  
│   │   │   ├── PresetManager/    \# 프리셋 관리  
│   │   │   ├── QueryHistory/     \# 조회 히스토리  
│   │   │   ├── Export/           \# CSV/JSON 다운로드 UI  
│   │   │   └── Layout/           \# Header, Sidebar (메뉴 권한 반영)  
│   │   ├── pages/  
│   │   │   ├── Dashboard.tsx     \# CSV 추출  
│   │   │   ├── JsonExport.tsx    \# JSON 전문 다운로드(별도 메뉴)  
│   │   │   └── AdminUsers.tsx    \# 관리자 \- 사용자/권한 관리  
│   │   ├── hooks/  
│   │   ├── types/  
│   │   └── App.tsx  
│   ├── public/  
│   └── ...  
├── backend/                      \# Node.js \+ Express  
│   ├── src/  
│   │   ├── routes/               \# API 라우트  
│   │   │   ├── auth.ts           \# 로그인/세션/토큰  
│   │   │   ├── data.ts           \# 조회/CSV/JSON Export  
│   │   │   └── adminUsers.ts     \# 사용자/권한 관리(Admin)  
│   │   ├── services/  
│   │   │   ├── queryBuilder.ts   \# 필터 → MongoDB 쿼리 변환  
│   │   │   ├── csvGenerator.ts   \# CSV 생성(+Truncate)  
│   │   │   ├── jsonExporter.ts   \# JSON Export(+gzip)  
│   │   │   └── schemaProvider.ts \# 동적 스키마 제공  
│   │   ├── middleware/  
│   │   │   ├── authz.ts          \# 메뉴/역할 권한 검사  
│   │   │   └── auditLogger.ts    \# 감사 로그  
│   │   ├── models/               \# User, Preset, AuditLog ...  
│   │   └── config/  
│   └── ...  
├── shared/                       \# 공유 타입/유틸  
└── docker-compose.yml            \# 로컬 개발 환경

(배포)  
├── .github/workflows/             \# CI/CD (Cloud Run 배포)  
│   └── deploy-backend-cloudrun.yml  
└── backend/Dockerfile             \# Cloud Run용 컨테이너 이미지 빌드

## **4.4 GitHub Pages 배포 가능성 검토**

* 결론(확정): 프론트엔드는 GitHub Pages(정적 SPA)로, 백엔드는 Google Cloud Run(서버리스 컨테이너)로 배포한다.  
* GitHub Pages는 정적 파일만 호스팅하므로, 데이터 조회/다운로드 API는 Cloud Run에서 제공한다.  
* Cloud Run은 요청 기반으로 자동 확장/축소(scale to zero)되며, 저빈도 사용 시 비용 효율적이다.  
* Cloud Run API는 HTTPS로 제공하고, 프론트 도메인에 대해 CORS allowlist를 적용한다.  
* 민감정보(DB 연결 문자열/JWT secret 등)는 Secret Manager(권장) 또는 Cloud Run 환경변수로 관리한다.  
* 배포 파이프라인(권장): GitHub Actions로 backend 컨테이너 빌드/배포, frontend GitHub Pages 배포를 분리한다.  
* (선택) 커스텀 도메인 분리: ui.example.com / api.example.com 형태로 운영한다.  
* MongoDB Atlas App Services(Data API/HTTPS Endpoints)는 EOL이므로 사용하지 않으며, MongoDB Driver 기반으로 Atlas에 접속한다.

## **4.5 비용 최소화 배포 옵션 검토**

본 프로젝트의 배포 방식은 서버리스 \+ Cloud Run 기반으로 확정합니다. 목표는 '저빈도 사용 시 비용 최소화'와 '운영 부담 최소화'입니다.

### **4.5.1 배포 결정 (확정)**

* Frontend: GitHub Pages (정적 SPA)  
* Backend API: Google Cloud Run (서버리스 컨테이너, Node.js/Express)  
* Database: MongoDB Atlas (Read-Only 계정)  
* 장점: scale to zero(미사용 시 0원에 가까움), HTTPS 기본, 배포 자동화 용이

구성 요소 요약

| 레이어 | 서비스 | 역할 | 비고 |
| :---- | :---- | :---- | :---- |
| Frontend | GitHub Pages | 대시보드 UI 제공 | 정적 배포, CORS 대상 도메인 |
| Backend | Cloud Run | 조회/Export API 제공 | 컨테이너 배포, scale to zero |
| Secrets | Secret Manager(권장) | 민감정보 관리 | MONGODB\_URI, JWT\_SECRET 등 |

### **4.5.2 Cloud Run 구성 (권장)**

* 단일 Cloud Run 서비스로 API 제공 (예: log-csv-api).  
* 엔드포인트는 /api/\* 경로로 제공하며, 프론트는 GitHub Pages에서 API를 호출한다.  
* CSV/JSON Export는 파일 저장이 아닌 HTTP Response 스트리밍 방식으로 제공한다.  
* (선택) 커스텀 도메인(api.example.com) 및 HTTPS 인증서 적용.

### **4.5.3 Cloud Run 권장 설정 (비용 최소화)**

* 최소 인스턴스(min instances): 0 (미사용 시 scale to zero)  
* 최대 인스턴스(max instances): 2\~3 (DB 부하/비용 상한)  
* 동시성(concurrency): 20\~40 권장 (스트리밍 다운로드 품질/DB 부하 고려)  
* 요청 타임아웃(timeout): 300초 권장 (Export 작업 대비)  
* CPU: 요청 처리 중에만 할당(CPU only during request), 메모리 512MB\~1GB

### **4.5.4 보안/비밀관리/운영**

* Secret Manager(권장): MONGODB\_URI, JWT\_SECRET 등 민감정보를 코드와 분리  
* Cloud Run 서비스 계정은 최소 권한 원칙 적용(Secret 접근, 로깅 등 필요한 권한만)  
* CORS allowlist: GitHub Pages 도메인만 허용(개발/운영 도메인 분리)  
* 감사 로그(Audit Log): 누가/언제/어떤 조건으로 조회·다운로드 했는지 저장  
* (선택) 내부 전용이면 Cloud Run IAM 인증(인증된 호출자만) \+ 앱 권한(RBAC) 조합 적용

### **4.5.5 MongoDB Atlas 네트워크 접근 고려**

* Atlas Network Access에 IP allowlist를 사용 중이면, Cloud Run egress IP가 고정되지 않는다.  
* 이 경우 Serverless VPC Access \+ Cloud NAT로 고정 egress IP를 구성한 뒤 Atlas allowlist에 등록하는 방식을 검토한다.  
* Network 제한을 사용하지 않는 경우에도, Read-Only 계정 \+ 쿼리 가드레일로 피해 범위를 최소화한다.

### **4.5.6 CI/CD (권장)**

* backend: GitHub Actions → Docker build → Artifact Registry push → Cloud Run deploy  
* frontend: GitHub Actions(또는 수동) → GitHub Pages 배포  
* 환경 분리: dev/prod 프로젝트 또는 Cloud Run 서비스 분리(환경변수/Secret 분리)

# **5\. API 명세 (초안)**

## **5.1 스키마 조회 API**

| 항목 | 내용 |  |  |  |  |
| :---- | :---- | :---- | :---- | :---- | :---- |
| Endpoint | GET /api/schema/:dataType |  |  |  |  |
| Method | GET |  |  |  |  |
| Parameters | dataType: conversations | api\_usage\_logs | event\_logs | error\_logs | ... |
| Response | { "columns": \[{ key, label, type }\], "filters": \[{ key, label, type, options? }\] } |  |  |  |  |
| 설명 | 데이터 유형 선택 시 해당 Collection의 필터 항목과 컬럼 목록을 프론트엔드에 제공 |  |  |  |  |

## **5.2 고객 검색 API**

| 항목 | 내용 |
| :---- | :---- |
| Endpoint | GET /api/customers/search?q={keyword} |
| Method | GET |
| Parameters | q: 검색 키워드 (고객 ID 또는 고객명, 최소 2글자) |
| Response | { "customers": \[{ id, name, email }\] } (최대 20건) |
| 설명 | 고객 검색 자동완성용. debounce 300ms 권장 |

## **5.3 데이터 조회 API**

| 항목 | 내용 |
| :---- | :---- |
| Endpoint | POST /api/data/query |
| Method | POST |
| Request Body | { "dataType": string, "customerId": string, "dateRange": { start, end }, "filters": { \[key\]: value }, "columns": string\[\], "pageSize": number, (옵션) "cursor": { "afterTs": string, "afterId": string }, (옵션) "includeTotal": boolean } |
| Response | { "rows": object\[\], (옵션) "total": number, "pageSize": number, (옵션) "nextCursor": { "afterTs": string, "afterId": string }, "hasMore": boolean } |
| 설명 | 필터 조건을 받아 MongoDB에서 데이터를 조회하여 반환 |

## **5.4 CSV 다운로드 API**

| 항목 | 내용 |
| :---- | :---- |
| Endpoint | POST /api/data/export-csv |
| Method | POST |
| Request Body | 조회 API와 동일한 필터 조건 (page/pageSize 제외, 전체 데이터 추출) |
| Response | CSV 파일 스트림 (Content-Type: text/csv, Content-Disposition: attachment) |
| 설명 | 현재 필터 조건으로 전체 데이터를 CSV로 변환하여 다운로드. 서버는 Cursor 스트리밍으로 생성하며, 동시 Export 제한/타임아웃을 적용. |

## **5.5 JSON 전문 다운로드 API**

| 항목 | 내용 |
| :---- | :---- |
| Endpoint | POST /api/data/export-json |
| Method | POST |
| Request Body | 조회 API와 동일한 필터 조건 (page/pageSize 제외, 전체 데이터 추출) |
| Response | JSON(.json) 또는 JSON Gzip(.json.gz) 파일 스트림 |
| 설명 | 현재 필터 조건으로 Truncate 없이 JSON(.json 또는 .json.gz) 다운로드 제공. 서버는 Cursor 스트리밍으로 생성하며, 동시 Export 제한/타임아웃을 적용. |

## **5.6 인증/사용자 관리 API (이메일 기반)**

### **5.6.1 내 정보 조회**

| 항목 | 내용 |
| :---- | :---- |
| Endpoint | GET /api/me |
| Method | GET |
| Response | { "email": string, "name": string, "role": string, "allowedMenus": string\[\], "allowedDataTypes": string\[\] } |
| 설명 | 로그인 사용자 정보 및 접근 가능한 메뉴/데이터 유형 목록 제공 |

### **5.6.2 관리자 \- 사용자 관리**

| Method | Endpoint | 설명 |
| :---- | :---- | :---- |
| GET | /api/admin/users | 사용자 목록 조회 |
| POST | /api/admin/users | 사용자 생성 (email, name?, role, allowedMenus, allowedDataTypes, status) |
| PUT | /api/admin/users/:id | 사용자 권한/상태 수정 |
| DELETE | /api/admin/users/:id | (옵션) 사용자 비활성화로 대체 권장 |

* 로그인 구현 상세(예: SSO/OAuth vs 이메일 OTP vs 사내 계정 연동)는 운영 환경에 따라 확정하며, PRD 범위에서는 "이메일이 사용자 식별자이며, 관리자가 등록한 사용자만 접근 가능"을 필수로 합니다.

## **5.7 프리셋 API**

| 항목 | 내용 |
| :---- | :---- |
| GET | /api/presets — 저장된 프리셋 목록 조회 |
| POST | /api/presets — 새 프리셋 저장 { name, dataType, filters, columns } |
| PUT | /api/presets/:id — 프리셋 수정 |
| DELETE | /api/presets/:id — 프리셋 삭제 |

# **6\. UI/UX 요구사항**

## **6.1 화면 구성 (와이어프레임)**

| 영역 | 위치 | 설명 |
| :---- | :---- | :---- |
| 헤더 | 상단 고정 | 로고, 서비스명, 사용자 이메일, 로그아웃 |
| 사이드바 | 좌측 240px | 사용자 권한에 따라 메뉴 노출 (CSV 추출 / JSON 전문 다운로드 / 관리자 등) |
| 필터 패널 | 메인 상단 | 1단: 데이터 유형 \+ 고객 \+ 기간 / 2단: 추가 필터(동적) / 액션: 조회/초기화 |
| 결과 테이블 | 메인 중앙 | 컬럼 정렬, 페이지네이션, 행 호버 하이라이트 |
| 하단 액션 바 | 테이블 하단 | 총 건수 표시, 컬럼 선택, CSV 다운로드(Truncate 안내) |
| 관리자 화면 | 별도 페이지 | 사용자 목록/추가/권한 편집(메뉴 접근 체크박스) |

## **6.2 필터 패널 레이아웃 상세**

필터 패널은 2단 구조로 배치됩니다:

1단 (필수 필터 \- 항상 표시):

* 데이터 유형: 드롭다운 (Select)  
* 고객: 검색 입력창 (Combobox)  
* 기간: Date Range Picker \- 빠른 선택 버튼(오늘, 7일, 30일, 3개월) \+ 직접 입력

2단 (추가 필터 \- 데이터 유형에 따라 동적 표시):

* 대화 기록: 모델명(드롭다운), 토큰 사용량(숫자 범위 입력)  
* API 사용량: endpoint(검색), method(드롭다운), statusCode(드롭다운)  
* 에러 로그: errorCode(검색), severity(드롭다운: info/warn/error/critical)  
* 이벤트 로그: eventType(드롭다운)

액션 버튼:

* “조회” 버튼: 필터 조건으로 데이터 조회 실행  
* “초기화” 버튼: 모든 필터 초기화  
* “프리셋 저장” 버튼: 현재 필터 조건을 프리셋으로 저장

## **6.3 결과 테이블 상세**

* 컬럼 헤더 클릭 시 오름차순/내림차순 정렬 토글  
* 페이지네이션: 페이지당 25/50/100행 선택 가능  
* 빈 상태: 결과가 없을 때 사용자 친화적 안내 메시지 표시  
* 로딩: 테이블 영역에 스켈레톤 로더 표시  
* Nested 데이터: 중첩 구조는 플랫트닝하여 표시 (messages\[0\].content → messages\_0\_content)  
* CSV 다운로드: 다운로드 전/후에 “5,000자 초과 텍스트는 잘립니다. 전문은 JSON 다운로드 메뉴를 사용하세요.” 안내 표시

## **6.4 UX 원칙**

* Zero Learning Curve: 웹 검색처럼 직관적으로 사용할 수 있어야 합니다. 별도 교육 불필요.  
* 즉시 피드백: 필터 변경 시 결과 건수 예상치(\~XX건 예상)를 버튼 옆에 표시  
* 에러 처리: 조회 실패 시 구체적인 원인과 해결 방법 안내  
* 반응형: 태블릿(768px+)과 데스크탑을 기본 지원. 모바일은 P2.  
* 권한 기반 탐색: 권한이 없는 메뉴는 숨기고, 직접 URL 접근 시에도 차단(403) 및 안내 화면 제공

# **7\. 비기능 요구사항**

## **7.1 보안**

| ID | 요구사항 | 상세 |
| :---- | :---- | :---- |
| NF-01 | Read-Only 접근 | MongoDB 접속은 반드시 Read-Only 사용자로 연결. write/delete/drop 원천 차단 |
| NF-02 | 쿼리 화이트리스트 | 백엔드 쿼리 빌더가 허용된 조작만 생성 (find, aggregate만 허용) |
| NF-03 | 인증/인가 | 등록된 이메일 사용자만 로그인 가능. 역할 기반 \+ 메뉴 권한 기반 접근 제어 |
| NF-04 | 감사 로그 | 모든 조회/다운로드 실행 기록 저장 (누가, 언제, 어떤 조건, CSV/JSON, 건수) |
| NF-05 | 결과 건수 제한 | 1회 추출당 최대 10,000건. 초과 시 안내 및 필터 세분화 권고 |
| NF-06 | PII 마스킹 | 민감 필드(이메일, 전화번호 등) 자동 마스킹 옵션 제공 |
| NF-07 | Injection 방지 | 모든 필터 입력값을 백엔드에서 검증/살균 처리 |

## **7.2 성능**

| ID | 요구사항 | 목표치 |
| :---- | :---- | :---- |
| NF-08 | 조회 응답 시간 | 필터 조건 제출 → 결과 테이블 표시까지 3초 이내 (데이터 1,000건 기준) |
| NF-09 | CSV 생성 시간 | 10,000건 기준 5초 이내 |
| NF-10 | 동시 사용자 | 최대 10명 동시 접속 지원 |
| NF-11 | CSV 파일 크기 제한 | 1회 최대 50MB (Truncate 포함) |
| NF-12 | DB 성능 보호 | 쿼리 타임아웃 30초 설정. 프로덕션 DB 영향 최소화 |
| NF-13 | JSON 파일 크기/압축 | JSON Export는 기본 gzip 압축 옵션 제공. 단일 파일 크기 상한 정의(예: 200MB) |
| NF-14 | 메뉴 권한 성능 | 메뉴/권한 체크는 요청당 O(1)에 가깝게 처리(JWT 클레임 또는 캐시 활용) |
| NF-15 | 부하 최소화 조회 방식 | (기본) 고객+기간 필수, 미리보기 기본 100행, seek pagination 사용. (제한) 동시 Export 수 제한(예: 전체 1\~2개), 동일조건 재조회 시 단기 캐시(옵션). |

# **8\. 쿼리 빌더 상세**

## **8.1 필터 → MongoDB Aggregation Pipeline 변환 로직**

백엔드의 queryBuilder 모듈은 프론트엔드에서 전달받은 필터 JSON을 MongoDB Aggregation Pipeline으로 변환합니다. LLM이 아닌 규칙 기반(Rule-based) 변환이므로 예측 가능하고 안정적입니다.

변환 예시:

입력 필터 JSON:

{ "dataType": "api\_usage\_logs", "customerId": "cust\_123", "dateRange": { "start": "2024-01-01", "end": "2024-01-31" }, "filters": { "method": "POST", "statusCode": "500" } }

변환된 MongoDB Pipeline:

\[ { "$match": { "userId": "cust\_123", "timestamp": { "$gte": "2024-01-01", "$lte": "2024-01-31" }, "method": "POST", "statusCode": 500 } }, { "$sort": { "timestamp": \-1 } }, { "$limit": 10000 } \]

## **8.2 스키마 설정 파일**

각 데이터 유형별 필터 항목과 컬럼 정보를 설정 파일로 관리합니다. Collection 구조가 변경되면 이 설정 파일만 수정하면 됩니다:

// config/schema/api\_usage\_logs.ts

export const apiUsageLogsSchema \= {  
  collection: "api\_usage\_logs",  
  customerField: "userId",  
  timestampField: "timestamp",  
  filters: \[  
    { key: "endpoint", label: "Endpoint", type: "search" },  
    { key: "method", label: "Method", type: "select", options: \["GET","POST","PUT","DELETE"\] },  
    { key: "statusCode", label: "Status", type: "select", options: \["200","400","401","403","404","500"\] },  
  \],  
  columns: \[  
    { key: "timestamp", label: "시간" },  
    { key: "endpoint", label: "Endpoint" },  
    { key: "method", label: "Method" },  
    { key: "statusCode", label: "Status Code" },  
    { key: "responseTime", label: "응답시간(ms)" },  
  \]  
};

# **9\. 바이브 코딩 가이드**

## **9.1 모듈별 개발 순서 (권장)**

| Phase | 모듈 | 상세 작업 |
| :---- | :---- | :---- |
| Phase 1 | 프로젝트 초기 세팅 | Monorepo 구성, Docker Compose, TypeScript 설정, 공유 타입 정의 |
| Phase 2 | 스키마 설정 \+ 쿼리 빌더 | 데이터 유형별 스키마 설정 파일, 필터→MongoDB 변환 모듈 |
| Phase 3 | Backend API | Express 서버, 데이터 조회 API, CSV/JSON Export, 고객 검색 API, 사용자/권한 API |
| Phase 4 | Frontend 필터 패널 | 드롭다운, 고객 검색, DatePicker, 동적 필터 컴포넌트 |
| Phase 5 | Frontend 결과/다운로드 | 결과 테이블, CSV 다운로드(Truncate), JSON 다운로드 메뉴 |
| Phase 6 | 프리셋 \+ 히스토리 | 프리셋 저장/불러오기, 조회 히스토리 목록 |
| Phase 7 | 관리자 기능 | 사용자/권한 관리, 메뉴 접근 제어, 감사 로그 |
| Phase 8 | 통합 및 QA | 전체 연동 테스트, 버그 수정, 성능 최적화, 배포 |

## **9.2 바이브 코딩 시 주의사항**

* 공통 타입 정의: shared/ 폴더에 FilterCondition, QueryResult, DataType 등 프론트엔드와 백엔드가 공유하는 TypeScript 타입을 먼저 정의합니다.  
* 환경변수 분리: DB 접속 정보, JWT 시크릿 등은 반드시 .env 파일로 분리하고 .gitignore에 추가합니다.  
* Nested 데이터 처리: MongoDB 도큐먼트의 중첩 구조를 CSV로 변환할 때 플랫트닝 로직을 반드시 포함합니다.  
* Truncate 정책: CSV Truncate는 "문자열 길이 기준"으로 적용하며, 원문 필요 시 JSON Export로 제공하는 정책을 문서화합니다.  
* 메뉴 권한: 프론트는 메뉴를 숨기되, 백엔드에서도 반드시 동일한 권한 검사를 수행합니다.

# **10\. 예상 일정 및 마일스톤**

| 마일스톤 | 기간 (추정) | 주요 산출물 |
| :---- | :---- | :---- |
| M1: 프로젝트 세팅 | 0.5주 | 개발 환경, 보일러플레이트, Docker, 공유 타입 |
| M2: 스키마 \+ 쿼리 빌더 | 1주 | 스키마 설정 파일, 필터→MongoDB 변환 모듈 |
| M3: Backend API | 1주 | 조회, CSV/JSON Export, 고객 검색, 사용자/권한 API |
| M4: Frontend 필터 패널 | 1.5주 | 드롭다운, 검색, DatePicker, 동적 필터 |
| M5: Frontend 결과/다운로드 | 1주 | 결과 테이블, CSV 다운로드, JSON 다운로드 |
| M6: 프리셋 \+ 히스토리 | 0.5주 | 프리셋 CRUD, 사이드바 연동 |
| M7: 관리자 기능 | 0.5주 | 사용자/권한 관리, 메뉴 접근 제어 |
| M8: 통합 QA \+ 배포 | 1주 | E2E 테스트, 버그수정, 배포 |

# **11\. 제약사항 및 리스크**

| 구분 | 내용 | 대응 방안 |
| :---- | :---- | :---- |
| 스키마 변경 | Collection 구조 변경 시 스키마 설정 파일 업데이트 필요 | 스키마 설정 파일만 수정하면 자동 반영되도록 설계 |
| 복잡한 조건 | 필터 UI로 표현하기 어려운 복잡한 쿼리 요청 | “고급 필터” 모드 추가 (v2.0) 또는 개발자 직접 처리 |
| 대용량 데이터 | 수십만 건 이상 추출 시 성능 이슈 | 건수 제한 \+ 스트리밍 다운로드 \+ 필터 세분화 권고 |
| 보안 리스크 | NoSQL Injection 가능성 | Read-Only 강제 \+ 입력값 검증/살균 \+ 감사 로그 |
| DB 부하 | 빈번한 조회로 프로덕션 DB 부하 발생 | Read Replica 사용, 쿼리 타임아웃, 결과 캐싱 |
| GitHub Pages 한계 | GitHub Pages는 정적 호스팅으로 서버 사이드 런타임 제공 불가 | 프론트만 GitHub Pages, 백엔드는 별도 호스팅(서버리스 Functions/Cloud Run/Lambda 등). |
| Atlas Data API/HTTPS Endpoints EOL | MongoDB Atlas App Services(Data API/HTTPS Endpoints) 서비스 종료로 신규 도입/확장에 제약 | MongoDB Driver 기반의 별도 백엔드(API)로 구현(서버리스 Functions/Lambda/Cloud Run 등). |

# **12\. 향후 확장 계획 (v2.0+)**

* 예약 내보내기: 특정 필터 조건을 정기적으로 자동 실행하여 이메일/슬랙 발송  
* 대시보드 시각화: 추출된 데이터를 차트/그래프로 시각화  
* 고급 필터: OR 조건, 중첩 조건 그룹 등 복잡 필터링  
* AI 채팅 모드: 복잡한 요청을 자연어로 처리하는 모드  
* 다중 DB 지원: MongoDB 외 PostgreSQL/Redis 등 연동  
* 고객 셀프서비스 포털: 고객이 직접 자신의 데이터를 추출하는 포털  
* Webhook 연동: 특정 조건 충족 시 자동 알림 및 데이터 추출 트리거

# **13\. 문서 승인**

| 역할 | 이름 | 서명 | 날짜 |
| :---- | :---- | :---- | :---- |
| 작성자 |  |  |  |
| PM / 프로덕트 오너 |  |  |  |
| 개발 리드 |  |  |  |
| 보안 담당자 |  |  |  |

\--- End of Document \---
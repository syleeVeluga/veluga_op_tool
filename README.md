# User Log Dashboard

고객 로그 데이터 추출 대시보드 프로젝트입니다.

- Frontend: React SPA (운영)
- Backend: Node.js + Express + TypeScript
- Infra: Docker + Google Cloud Run
- DB: MongoDB Atlas (Read-Only 접근 전제)

현재 저장소는 **백엔드 조회/집계 API 1차 구현 + Cloud Run 배포 자동 검증/롤백 스크립트**까지 반영된 상태입니다.

## 1) 프로젝트 목적

운영/CS 팀이 개발자 도움 없이도 다음을 수행할 수 있도록 하는 것이 목표입니다.

- 고객/기간/조건 기반 로그 조회
- CSV 다운로드 (문자열 Truncate 정책 적용)
- JSON 원문 다운로드 (별도 메뉴)
- 사용자/메뉴/데이터 접근 권한 관리

상세 요구사항은 [PRD_v1_2_1_CloudRun.md](PRD_v1_2_1_CloudRun.md)를 참고하세요.

## 2) 현재 구현 상태 (2026-02-15 기준)

구현 완료:

- Express 서버 구동
- 헬스체크 엔드포인트
  - `GET /health`
  - `GET /api/health`
- 스키마 조회 엔드포인트
  - `GET /api/schema/:dataType`
  - 정상 응답: `{ columns: [{ key, label, type }], filters: [{ key, label, type, options? }] }`
  - 오류 응답(잘못된 dataType): `400 { error, message, supportedDataTypes }`
- dataType 스키마 레지스트리/프로바이더 뼈대
  - `conversations`, `api_usage_logs`, `event_logs`, `error_logs`, `billing_logs`, `user_activities`
- 조회/집계 API
  - `POST /api/data/query`
  - `POST /api/data/query-batch/conversations`
  - `POST /api/data/summary/period`
  - `POST /api/data/summary/by-data-type`
  - `GET /api/customers/search?q=`
- 서버 스트리밍 Export API
  - `POST /api/data/export-csv`
  - `POST /api/data/export-json`
  - 선택적 gzip(`?gzip=1`) 지원
- 전역 에러 핸들링
  - `backend/src/middleware/errorHandler.ts`
  - 구조화된 오류 응답: `{ error: { code, message, details? } }`
- Docker 멀티스테이지 빌드 (`backend/Dockerfile`)
- Cloud Run 배포 스크립트 (`scripts/deploy-cloudrun.ps1`)
  - 환경변수 주입(`-SetEnvVars`)
  - 배포 후 헬스체크 자동 검증
  - 실패 시 이전 Revision 자동 롤백
- GitHub Actions 배포 워크플로우 (`.github/workflows/deploy-backend-cloudrun.yml`)
- 최소 스모크 테스트
  - `backend/scripts/smoke-schema-endpoint.ts`
  - `backend/scripts/smoke-data-type-summary-endpoint.ts`
  - 각 API 입력 검증 경로 중심 스모크 검증
- 프론트엔드 MVP 연결
  - 필터/조회/결과 테이블 렌더링
  - 결과 컬럼 선택 및 localStorage 상태 저장
  - CSV/JSON 클라이언트 다운로드(선택 컬럼 기준)
  - 운영자 가이드: dataType별 식별자 키 안내
  - 서비스 로그 전용 페이지(`/service-logs`) + 고객 보고 모드 조회
  - 로그 기본 정렬 토글(오름차순/최신순) + 정렬 상태 저장
  - partner ID 기반 사용자 확장 조회(`users.members`)
  - 고객 검색 상단 배치 + 채널 조회/선택 기반 2단계 조회 UX
  - `conversations`에서 채널 선택 시 대화 로그 자동 조회
  - 공통 UI 컴포넌트 분리(`frontend/src/components/ui/`)
    - `Button`, `Input`, `Skeleton`, `DataTable`

미구현(다음 단계):
- 프리셋 저장/불러오기 고도화

진행상황 문서는 [PROJECT_STATUS.md](PROJECT_STATUS.md), 아키텍처는 [ARCHITECTURE.md](ARCHITECTURE.md)에서 확인할 수 있습니다.

## 3) 저장소 구조

```text
user_log_dashboard/
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── scripts/
│   │   ├── profile-mongo-readonly.cjs
│   │   └── smoke-schema-endpoint.ts
│   └── src/
│       ├── app.ts
│       ├── index.ts
│       ├── routes/
│       │   └── data.ts
│       ├── services/
│       │   └── schemaProvider.ts
│       └── config/
│           ├── database.ts
│           ├── env.ts
│           └── schema/
├── scripts/
│   └── deploy-cloudrun.ps1
├── .github/workflows/
│   └── deploy-backend-cloudrun.yml
├── PRD_v1_2_1_CloudRun.md
├── ARCHITECTURE.md
├── DEVELOPMENT_PLAN.md
├── PROJECT_STATUS.md
└── README.md
```

## 4) 로컬 실행

### 사전 요구사항

- Node.js 22+
- npm
- Docker Desktop (배포 이미지 빌드 시)

### 백엔드 실행

```powershell
cd backend
npm install
npm run dev
```

기본 포트는 `8080`이며, 확인:

- `http://localhost:8080/health`
- `http://localhost:8080/api/health`
- `http://localhost:8080/api/schema/api_usage_logs`

### 프론트엔드 실행

```powershell
cd frontend
npm install
npm run dev
```

기본 URL: `http://localhost:5173`

### 운영자 조회 팁 (ID 확보)

- 사용자 이메일/이름 → `고객 검색(자동완성)`으로 사용자 ID(`customerId`) 선택
- partner ID(파트너 대표 사용자 ID) → `Partner ID 기반 사용자 확장`으로 `users.members` 포함 사용자 ID 묶음 조회
- 묶음 조회는 현재 `conversations`, `api_usage_logs`, `billing_logs`에서 지원

권장 조회 흐름(UI):

1. 상단 `고객 검색(자동완성)`에서 고객을 선택해 `Customer ID`를 채움
2. `채널 조회` 버튼으로 해당 고객의 채널 목록을 로드
3. 채널 선택
  - `conversations` 데이터 타입은 채널 선택 즉시 대화 로그 자동 조회
  - 그 외 데이터 타입은 필요 시 `로그 조회` 버튼으로 최종 조회
4. 기간/필터/컬럼을 조정해 결과 확인 및 CSV/JSON 다운로드

백엔드 기준 관련 API:

- `GET /api/customers/search?q=`: 이메일/이름/ID로 사용자 검색
- `GET /api/customers/by-partner?partnerId=`: partner 기준 사용자 ID 묶음 해석
- `POST /api/data/query`: `customerId`(단일) 또는 `customerIds`(배열) 중 하나로 조회

### Playwright로 프론트 확인

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

다른 터미널에서:

```powershell
cd ..
npx.cmd playwright install
npx.cmd playwright screenshot --wait-for-timeout=2000 http://127.0.0.1:4173 playwright-frontend-home.png
```

성공 시 루트 경로에 `playwright-frontend-home.png`가 생성됩니다.

## 5) 빌드 및 컨테이너

```powershell
cd backend
npm run build
npm run start

# 최소 스모크 테스트
npm run test:smoke:schema
```

Docker 이미지 빌드 예시:

```powershell
cd backend
docker build -t log-csv-api:local .
```

## 6) Cloud Run 배포

### 수동 배포 (PowerShell)

```powershell
.\scripts\deploy-cloudrun.ps1
```

기본 파라미터:

- Project: `veluga-ops-tool`
- Region: `asia-northeast3`
- Repository: `veluga-backend`
- Service: `log-csv-api`
- Image: `log-csv-api`

추가 파라미터:

- `-SetEnvVars "KEY=VALUE","KEY2=VALUE2"` : Cloud Run 환경변수 반영
- `-CanaryPercent <1~99>` : 신규 Revision을 무트래픽 배포 후 지정 비율만 카나리 트래픽 분할
- `-PromoteCanary` : 카나리 헬스체크 통과 시 신규 Revision 100% 승격
- `-SkipHealthCheck` : 배포 후 헬스체크(`/health`, `/api/health`, `/api/schema/api_usage_logs`) 생략
- `-DisableAutoRollback` : 헬스체크 실패 시 자동 롤백 비활성화
- `-HealthCheckMaxAttempts <N>` : 헬스체크 최대 재시도 횟수 (기본 12)
- `-HealthCheckIntervalSec <N>` : 헬스체크 재시도 간격(초, 기본 5)

필요 시 오버라이드:

```powershell
.\scripts\deploy-cloudrun.ps1 -ProjectId "<PROJECT_ID>" -Region "asia-northeast3"
```

운영 배포 예시 (환경변수 포함):

```powershell
.\scripts\deploy-cloudrun.ps1 `
  -SetEnvVars "NODE_ENV=production","MONGODB_URI=<SECRET>","MONGODB_DB_NAME=logdb","OPS_TOOL_DB_NAME=ops_tool","CORS_ORIGIN=*"
```

카나리 배포 예시 (10% 트래픽 전환 후 통과 시 100% 승격):

```powershell
.\scripts\deploy-cloudrun.ps1 `
  -CanaryPercent 10 `
  -PromoteCanary `
  -SetEnvVars "NODE_ENV=production","MONGODB_URI=<SECRET>","MONGODB_DB_NAME=logdb","OPS_TOOL_DB_NAME=ops_tool","CORS_ORIGIN=*"
```

자동 롤백까지 포함한 기본 흐름:

1. 배포 전 현재 최신 Revision 이름 자동 캡처
2. 새 이미지 빌드/푸시 및 Cloud Run 배포
3. 서비스 URL 기준 헬스체크 3개 엔드포인트 검증
4. 실패 시 이전 Revision으로 트래픽 즉시 롤백

카나리 모드(`-CanaryPercent`) 흐름:

1. 기존 안정 Revision 확인
2. 신규 Revision `--no-traffic` 배포
3. `신규=CanaryPercent`, `기존=100-CanaryPercent`로 트래픽 분할
4. 헬스체크 실패 시 기존 Revision 100% 자동 롤백
5. `-PromoteCanary` 지정 시 통과 후 신규 Revision 100% 승격

### CI/CD 배포

- `main` 브랜치에 `backend/**` 변경 푸시 시 자동 배포
- 워크플로우: `.github/workflows/deploy-backend-cloudrun.yml`
- Google Cloud 인증은 아래 두 방식 중 하나를 설정
  - 방식 A (권장 빠른 설정): GitHub Secret `GCP_SA_KEY` (서비스 계정 JSON 원문)
  - 방식 B (권장 보안): GitHub Variables `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`
- `main` 브랜치에 `frontend/**` 변경 푸시 시 GitHub Pages 자동 배포
- 워크플로우: `.github/workflows/deploy-frontend-pages.yml`
- GitHub Repository Variables 권장값:
  - `VITE_API_BASE_URL=https://<cloud-run-service-url>/api`
    - `/api`를 누락해도 프런트에서 자동으로 `/api`를 붙여 보정
  - `VITE_BASE_PATH`는 비워두는 것을 권장 (워크플로에서 자동 계산)
    - User/Org Pages(`<owner>.github.io`): `/`
    - Project Pages(일반 저장소): `/<repo>/`

## 7) 운영 중 서비스

최근 배포 기준 서비스:

- Service: `log-csv-api`
- Region: `asia-northeast3`
- URL: `https://log-csv-api-1054581024067.asia-northeast3.run.app`

참고: 루트(`/`)는 404일 수 있으며, 정상 여부는 헬스 엔드포인트로 확인하세요.

## 8) 다음 우선순위

1. 서버 스트리밍 Export API 고도화 (`/api/data/export-csv`, `/api/data/export-json`)
2. 프리셋 CRUD 및 재실행 UX 추가
3. 조회 히스토리 고도화(필터/응답 메타 재사용)
4. 대용량 기간/채널 조합 성능 가드레일 보강
5. 문서-릴리스 연동(변경 시 `PROJECT_STATUS.md` 요약 자동 갱신 규칙)

### 무영향 스키마 실사 실행

```powershell
cd backend
npm run profile:mongo:readonly
```

DNS 이슈가 있는 환경에서는 아래처럼 DNS 서버를 지정해 실행할 수 있습니다.

```powershell
cd backend
$env:MONGO_PROFILE_DNS_SERVERS="8.8.8.8,1.1.1.1"
npm run profile:mongo:readonly
```

동작 원칙:

- Read-Only 조회만 수행 (쓰기/인덱스 변경 없음)
- `readPreference: secondaryPreferred` 사용
- `maxTimeMS`로 쿼리 제한
- 결과는 로컬 파일 `backend/reports/mongo-profile-*.json`에 저장

최근 full-scan 결과:

- `backend/reports/mongo-profile-2026-02-14T06-19-07-163Z.json`
- `prod` 58개 컬렉션, `logdb` 2개 컬렉션 확인

---

필요하면 다음 작업으로 README 기준 체크리스트를 실제 이슈/마일스톤 형태로 분해해 드리겠습니다.

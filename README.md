# User Log Dashboard

고객 로그 데이터 추출 대시보드 프로젝트입니다.

- Frontend: React SPA (계획)
- Backend: Node.js + Express + TypeScript
- Infra: Docker + Google Cloud Run
- DB: MongoDB Atlas (Read-Only 접근 전제)

현재 저장소는 **백엔드 스캐폴딩 및 Cloud Run 배포 기반**까지 구현된 상태입니다.

## 1) 프로젝트 목적

운영/CS 팀이 개발자 도움 없이도 다음을 수행할 수 있도록 하는 것이 목표입니다.

- 고객/기간/조건 기반 로그 조회
- CSV 다운로드 (문자열 Truncate 정책 적용)
- JSON 원문 다운로드 (별도 메뉴)
- 사용자/메뉴/데이터 접근 권한 관리

상세 요구사항은 [PRD_v1_2_1_CloudRun.md](PRD_v1_2_1_CloudRun.md)를 참고하세요.

## 2) 현재 구현 상태 (2026-02-14 기준)

구현 완료:

- Express 서버 구동
- 헬스체크 엔드포인트
  - `GET /health`
  - `GET /api/health`
- Docker 멀티스테이지 빌드 (`backend/Dockerfile`)
- Cloud Run 배포 스크립트 (`scripts/deploy-cloudrun.ps1`)
- GitHub Actions 배포 워크플로우 (`.github/workflows/deploy-backend-cloudrun.yml`)

미구현(다음 단계):

- 인증/인가(JWT, RBAC)
- MongoDB 연동 및 쿼리 빌더
- CSV/JSON Export 엔진
- 프론트엔드 앱 전체

진행상황 문서는 [PROJECT_STATUS.md](PROJECT_STATUS.md), 아키텍처는 [ARCHITECTURE.md](ARCHITECTURE.md)에서 확인할 수 있습니다.

## 3) 저장소 구조

```text
user_log_dashboard/
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts
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

## 5) 빌드 및 컨테이너

```powershell
cd backend
npm run build
npm run start
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

필요 시 오버라이드:

```powershell
.\scripts\deploy-cloudrun.ps1 -ProjectId "<PROJECT_ID>" -Region "asia-northeast3"
```

### CI/CD 배포

- `main` 브랜치에 `backend/**` 변경 푸시 시 자동 배포
- 워크플로우: `.github/workflows/deploy-backend-cloudrun.yml`
- 필요 시 GitHub Secret: `GCP_SA_KEY`

## 7) 운영 중 서비스

최근 배포 기준 서비스:

- Service: `log-csv-api`
- Region: `asia-northeast3`
- URL: `https://log-csv-api-1054581024067.asia-northeast3.run.app`

참고: 루트(`/`)는 404일 수 있으며, 정상 여부는 헬스 엔드포인트로 확인하세요.

## 8) 다음 우선순위

1. MongoDB 연결 레이어(`config/database.ts`) 추가
2. dataType 스키마 파일 작성 (`chats`, `usagelogs`, `errorlogs`, `logentrydbs` 우선)
3. `queryBuilder.ts` 구현 (식별자 키 매핑 검증 포함)
4. `/api/data/query`, `/api/data/export-csv`, `/api/data/export-json` 구현
5. 인증/권한(`auth.ts`, `authz.ts`) 구현
6. 프론트엔드(Vite + React + Tailwind + shadcn/ui) 초기화

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

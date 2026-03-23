# User Log Dashboard

고객 로그 데이터 추출 대시보드. 운영/CS 팀이 개발자 없이 고객 로그를 조회·내보낼 수 있도록 하는 내부 도구.

- Frontend: React SPA (GitHub Pages)
- Backend: Node.js + Express + TypeScript (Cloud Run)
- DB: MongoDB Atlas (Read-Only)

상세 요구사항: [PRD_v1_2_1_CloudRun.md](PRD_v1_2_1_CloudRun.md) | 현재 상태: [PROJECT_STATUS.md](PROJECT_STATUS.md) | 아키텍처: [ARCHITECTURE.md](ARCHITECTURE.md)

## 로컬 실행

```bash
# 백엔드 (port 8080)
cd backend && npm install && npm run dev

# 프론트엔드 (port 5173)
cd frontend && npm install && npm run dev
```

헬스체크: `GET /health`, `GET /api/health`

## 운영자 조회 흐름

1. `고객 검색(자동완성)`에서 고객 선택 → `Customer ID` 자동 채움
2. `채널 조회` 버튼으로 채널 목록 로드 후 채널 선택
   - `conversations`: 채널 선택 즉시 자동 조회
   - 그 외 데이터 타입: `로그 조회` 버튼으로 조회
3. 기간/필터/컬럼 조정 후 CSV/JSON 다운로드

파트너 기관 전체 추출: `/partner-logs` 메뉴 (권한 필요)

## 빌드 및 스모크 테스트

```bash
cd backend
npm run build
npm run test:smoke:schema
npm run test:smoke:data-query
# 전체 목록: package.json 참조
```

## Cloud Run 배포

```bash
# 기본 배포
.\scripts\deploy-cloudrun.ps1

# 환경변수 포함
.\scripts\deploy-cloudrun.ps1 `
  -SetEnvVars "NODE_ENV=production","MONGODB_URI=<SECRET>","MONGODB_DB_NAME=logdb","OPS_TOOL_DB_NAME=ops_tool","CORS_ORIGIN=*"

# 카나리 배포 (10% 트래픽 → 통과 시 100% 승격)
.\scripts\deploy-cloudrun.ps1 -CanaryPercent 10 -PromoteCanary `
  -SetEnvVars "NODE_ENV=production","MONGODB_URI=<SECRET>","MONGODB_DB_NAME=logdb","OPS_TOOL_DB_NAME=ops_tool","CORS_ORIGIN=*"
```

CI/CD: `main` 브랜치 push 시 자동 배포 (backend → Cloud Run, frontend → GitHub Pages)

## 운영 중 서비스

- Service: `log-csv-api` / Region: `asia-northeast3`
- URL: `https://log-csv-api-1054581024067.asia-northeast3.run.app`

## MongoDB 스키마 실사

```bash
cd backend
npm run profile:mongo:readonly
# DNS 이슈 환경
$env:MONGO_PROFILE_DNS_SERVERS="8.8.8.8,1.1.1.1"
npm run profile:mongo:readonly
```

결과: `backend/reports/mongo-profile-*.json`

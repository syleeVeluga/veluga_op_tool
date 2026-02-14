# 프로젝트 진행 상황 — 고객 로그 데이터 추출 대시보드

> 최종 갱신: 2026-02-14
> 전체 진행률: ~15%

---

## 현재 상태 요약

| Phase | 설명 | 상태 | 진행률 |
|-------|------|------|--------|
| Phase 1 | 프로젝트 기반 보강 | 🟡 부분 완료 | 55% |
| Phase 2 | 스키마 설정 + 쿼리 빌더 | 🟡 진행중 | 20% |
| Phase 3 | 백엔드 API 구현 | ⬜ 미시작 | 0% |
| Phase 4 | 프론트엔드 레이아웃 + 필터 | ⬜ 미시작 | 0% |
| Phase 5 | 프론트엔드 결과/다운로드 | ⬜ 미시작 | 0% |
| Phase 6 | 프리셋 + 히스토리 | ⬜ 미시작 | 0% |
| Phase 7 | 관리자 기능 | ⬜ 미시작 | 0% |
| Phase 8 | 통합 테스트 + QA + 배포 | ⬜ 미시작 | 0% |

---

## 완료된 항목

### Phase 1 (부분 완료)

- [x] Express 서버 스켈레톤 (`backend/src/index.ts`)
  - health check: `GET /health`, `GET /api/health`
  - CORS, JSON body parser 설정
- [x] TypeScript 설정 (`backend/tsconfig.json` — ES2022, CommonJS, strict)
- [x] package.json 기본 설정 (`veluga-ops-tool-backend` v0.1.0)
  - 현재 의존성: `express`, `cors`
  - 스크립트: dev(tsx watch), build(tsc), start(node dist)
- [x] Docker 멀티스테이지 빌드 (`backend/Dockerfile` — Node 22 Alpine)
- [x] Cloud Run 수동 배포 스크립트 (`scripts/deploy-cloudrun.ps1`)
  - Artifact Registry: `asia-northeast3-docker.pkg.dev/veluga-ops-tool/veluga-backend/log-csv-api`
  - Cloud Run 설정: min 0 / max 3, concurrency 30, timeout 300s, memory 512Mi
- [x] GitHub Actions CI/CD (`.github/workflows/deploy-backend-cloudrun.yml`)
  - main 브랜치 backend/** 변경 시 자동 빌드+배포
- [x] MongoDB Atlas 접속 정보 (`.env.veluga.mongo`)
  - prod DB, logdb DB 연결 문자열 보유
- [x] .gitignore 설정 (.env*, node_modules, dist, build)
- [x] .dockerignore 설정
- [x] 환경변수 템플릿/로더 추가
  - `backend/.env.example`
  - `backend/src/config/env.ts` (Zod 기반 타입 검증)
- [x] 서버에 env 로더 연동 (`backend/src/index.ts`)

---

## 미완료 항목 (다음 작업)

### Phase 1 잔여
- [ ] `shared/types/` — 공유 TypeScript 타입 정의
- [ ] `frontend/` — React 프로젝트 초기화 (Vite + Tailwind + shadcn/ui)
- [ ] 백엔드 추가 의존성: jsonwebtoken, bcrypt, fast-csv
- [ ] 백엔드 디렉토리 구조: routes/, services/, middleware/, models/, config/

### Phase 2 (다음 마일스톤)
- [ ] **Production 무영향 스키마 실사**
  - [x] 제한 실행 성공 (`maxCollections=10`, `sampleDocs=2`)
  - [x] full-scan 실행 성공 (`maxCollections=500`, `sampleDocs=1`)
  - [x] 결과 리포트 생성: `backend/reports/mongo-profile-2026-02-14T06-19-07-163Z.json`
  - [ ] dataType/필터/식별자 키 최종 확정
- [ ] 6개 데이터 유형 스키마 설정 파일
- [ ] queryBuilder.ts — 필터 → MongoDB Aggregation Pipeline 변환
- [ ] 입력값 검증 (Zod 스키마)

### 실측 요약 (full-scan)
- `prod` DB: 58 collections
- `logdb` DB: 2 collections (`logentrydbs`, `logentries`)
- 대용량 우선 후보:
  - `prod.sessions` (~341만)
  - `prod.guests` (~282만)
  - `prod.chats` (~45만)
  - `prod.usagelogs` (~43만)
  - `logdb.logentrydbs` (~681만)

> 상세 내용은 DEVELOPMENT_PLAN.md 참조

---

## 파일 구조 (현재)

```
user_log_dashboard/
├── .env.veluga.mongo              ← MongoDB 접속 정보
├── .github/workflows/
│   └── deploy-backend-cloudrun.yml ← CI/CD
├── .gitignore
├── PRD_v1_2_1_CloudRun.md         ← 요구사항 정의서
├── DEVELOPMENT_PLAN.md            ← 개발 계획서
├── PROJECT_STATUS.md              ← 진행 상황 추적 (이 문서)
├── ARCHITECTURE.md                ← 아키텍처 참조
├── backend/
│   ├── .dockerignore
│   ├── Dockerfile
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts               ← 유일한 소스 파일 (health check만)
└── scripts/
    └── deploy-cloudrun.ps1
```

---

## 파일 구조 (목표)

```
user_log_dashboard/
├── shared/
│   └── types/                     ← 공유 타입
│       ├── filter.ts
│       ├── query.ts
│       ├── schema.ts
│       ├── user.ts
│       ├── preset.ts
│       ├── export.ts
│       └── index.ts
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── FilterPanel/
│   │   │   ├── DataTable/
│   │   │   ├── PresetManager/
│   │   │   ├── QueryHistory/
│   │   │   ├── Export/
│   │   │   └── Layout/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── JsonExport.tsx
│   │   │   ├── AdminUsers.tsx
│   │   │   └── Login.tsx
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── App.tsx
│   └── ...
├── backend/
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── data.ts
│   │   │   ├── adminUsers.ts
│   │   │   └── presets.ts
│   │   ├── services/
│   │   │   ├── queryBuilder.ts
│   │   │   ├── csvGenerator.ts
│   │   │   ├── jsonExporter.ts
│   │   │   └── schemaProvider.ts
│   │   ├── middleware/
│   │   │   ├── authz.ts
│   │   │   ├── auditLogger.ts
│   │   │   ├── validators.ts
│   │   │   └── errorHandler.ts
│   │   ├── models/
│   │   └── config/
│   │       ├── env.ts
│   │       ├── database.ts
│   │       └── schema/
│   │           ├── conversations.ts
│   │           ├── api_usage_logs.ts
│   │           ├── event_logs.ts
│   │           ├── error_logs.ts
│   │           ├── billing_logs.ts
│   │           ├── user_activities.ts
│   │           └── index.ts
│   └── ...
└── scripts/
```

---

## 변경 이력

| 날짜 | 변경 내용 |
|------|-----------|
| 2026-02-14 | 최초 작성. Phase 1 부분 완료 상태에서 시작. |

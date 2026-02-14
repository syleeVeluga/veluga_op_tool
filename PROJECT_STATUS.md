# 프로젝트 진행 상황 — 고객 로그 데이터 추출 대시보드

> 최종 갱신: 2026-02-14
> 전체 진행률: ~64%

---

## 현재 상태 요약

| Phase | 설명 | 상태 | 진행률 |
|-------|------|------|--------|
| Phase 1 | 프로젝트 기반 보강 | 🟡 부분 완료 | 55% |
| Phase 2 | 스키마 설정 + 쿼리 빌더 | 🟡 진행중 | 65% |
| Phase 3 | 백엔드 API 구현 | 🟡 진행중 | 78% |
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
  - 배포 후 헬스체크(`/health`, `/api/health`, `/api/schema/api_usage_logs`) 자동 검증
  - 실패 시 이전 안정 Revision으로 트래픽 자동 롤백 지원
  - `-SetEnvVars` 파라미터로 Cloud Run 환경변수 반영 지원
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

### Phase 3 (진행중)

- [x] MongoDB 연결 레이어 구현 (`backend/src/config/database.ts`)
  - MongoClient 싱글턴 + 연결풀링
  - readPreference: `secondaryPreferred`
  - 연결 상태 확인 함수 + ping 헬스체크
  - graceful shutdown (`SIGINT`, `SIGTERM`)
- [x] 서버 부트스트랩에 Mongo 초기 연결 연동 (`backend/src/index.ts`)
- [x] 헬스체크 고도화
  - `GET /health` → Mongo ping 기반 상태 반환
  - `GET /api/health` → Mongo 연결 상태 메타 반환
- [x] Express app 분리 (`backend/src/app.ts`)
  - 테스트 가능한 앱 팩토리(`createApp`) 구조 적용
- [x] 스키마 조회 API 뼈대 구현
  - `GET /api/schema/:dataType`
  - 정상 응답: `{ columns, filters }`
  - 잘못된 dataType 응답: `400 { error, message, supportedDataTypes }`
- [x] schemaProvider + dataType 레지스트리 추가
  - `backend/src/services/schemaProvider.ts`
  - `backend/src/config/schema/index.ts`
  - 6개 dataType 스키마 파일 스켈레톤 생성
- [x] 최소 스모크 테스트 추가
  - `backend/scripts/smoke-schema-endpoint.ts`
  - 검증 케이스: 정상 1건 + 잘못된 dataType 1건

---

## 미완료 항목 (다음 작업)

### Phase 8 (배포 전 체크리스트 — Cloud Run)

#### 0) 리허설 실행 전제
- [ ] `gcloud` CLI 설치 확인 (`gcloud --version`)
- [ ] `gcloud` 인증 확인 (`gcloud auth list`)
- [ ] 대상 프로젝트 확인 (`gcloud config get-value project`)

#### 1) 환경변수 점검 (Cloud Run 반영값)
- [ ] **필수** `MONGODB_URI` 설정 확인 (미설정 시 서버 부팅 실패)
- [ ] `NODE_ENV=production` 설정 확인
- [ ] `PORT=8080` 유지 (Cloud Run 컨테이너 포트와 일치)
- [ ] `MONGODB_DB_NAME` 확인 (기본값 `logdb`, 필요 시 오버라이드)
- [ ] `OPS_TOOL_DB_NAME` 확인 (기본값 `ops_tool`)
- [ ] `CORS_ORIGIN` 확인 (`*` 또는 허용 도메인 CSV)
- [ ] `QUERY_TIMEOUT_MS`, `MAX_EXPORT_ROWS` 운영 가드레일 값 확인
- [ ] (선택) `JWT_SECRET`/`JWT_EXPIRES_IN` 값 점검 (인증 경로 확장 대비)

#### 2) 배포 전 헬스체크 기준
- [ ] 로컬/스테이징 컨테이너 기준 `GET /health` 응답 `200` 확인
- [ ] Mongo ping 포함 응답 확인 (`status: ok`, `mongo.ok: true`)
- [ ] `GET /api/health` 응답에서 `uriConfigured: true` 확인
- [ ] 배포 후 서비스 URL 기준 아래 엔드포인트 재확인
  - [ ] `/health`
  - [ ] `/api/health`
  - [ ] `/api/schema/api_usage_logs` (기본 API smoke)

#### 3) 배포/검증 절차
- [ ] 새 이미지 태그(타임스탬프) 기록
- [ ] `scripts/deploy-cloudrun.ps1`로 배포 수행
- [ ] 신규 Revision Ready 상태 확인
- [ ] 응답 지연/오류율 간단 점검 (5xx, timeout)
- [ ] 장애 없을 때만 트래픽 100% 유지

#### 4) 롤백 포인트 (장애 대응)
- [ ] 배포 직전 **이전 안정 Revision 이름** 메모
- [ ] 배포 직전 **이전 이미지 태그** 메모
- [ ] 장애 시 즉시 이전 Revision으로 트래픽 복구
  - 예시: `gcloud run services update-traffic log-csv-api --region asia-northeast3 --to-revisions <PREV_REVISION>=100`
- [ ] 복구 후 `/health`, `/api/health` 재검증
- [ ] 롤백 사유/시각/영향 범위를 `PROJECT_STATUS.md`에 기록

#### 5) 배포 승인 게이트 (Go/No-Go)
- [ ] `health`/`api/health`/기본 schema API 모두 정상
- [ ] Mongo 연결 상태 정상 (`connected` 또는 ping 성공)
- [ ] 치명 오류(5xx 연속, 부팅 실패, 타임아웃 급증) 없음
- [ ] 롤백 포인트(이전 Revision/이미지 태그) 확보 완료

#### 6) Cloud Run 리허설 1회 (2순위)
- [ ] 배포 전 현재 Revision 캡처
  - [ ] `gcloud run revisions list --service log-csv-api --region asia-northeast3 --limit 1 --sort-by "~metadata.creationTimestamp"`
- [ ] 리허설 배포 실행 (`-SetEnvVars` 포함)
  - [ ] `./scripts/deploy-cloudrun.ps1 -SetEnvVars "NODE_ENV=production","MONGODB_URI=<SECRET>","MONGODB_DB_NAME=logdb","OPS_TOOL_DB_NAME=ops_tool","CORS_ORIGIN=*"`
- [ ] 자동 헬스체크 PASS 확인 (`/health`, `/api/health`, `/api/schema/api_usage_logs`)
- [ ] (선택) 롤백 동작 리허설
  - [ ] `gcloud run services update-traffic log-csv-api --region asia-northeast3 --to-revisions <PREV_REVISION>=100`
- [ ] 리허설 결과 기록 (성공/실패, 소요시간, 이슈)

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
  - [x] dataType/필터/식별자 키 최종 확정
  - [x] 보강 실사(`sampleDocs=10`) 실행 및 키 보강 확인: `backend/reports/mongo-profile-2026-02-14T08-59-20-716Z.json`
- [x] 6개 데이터 유형 스키마 설정 파일(실데이터 기반 1차 확정)
- [x] queryBuilder.ts — 필터 → MongoDB Aggregation Pipeline 변환
  - [x] `buildAggregationPipeline(request)` 구현
  - [x] `buildCountPipeline(request)` 구현
  - [x] seek pagination 커서(`afterTs`, `afterId`) 조건 반영
  - [x] 필수값 가드(`customerId`, `dateRange`) + 필터 키 검증
  - [x] 스모크 테스트 추가: `backend/scripts/smoke-query-builder.ts`
- [x] 입력값 검증 (Zod 스키마)
  - [x] `backend/src/middleware/validators.ts`
  - [x] `$` 접두사 키 차단 (재귀 검사)

### Phase 3 (다음 작업)
- [x] `GET /api/schema/:dataType` 라우트 + schemaProvider 뼈대 구현
- [x] `routes/`, `services/` 디렉토리 생성 및 라우터 마운트 구조 전환
- [x] `GET /api/schema/:dataType` 최소 스모크 테스트 2케이스
- [x] `POST /api/data/query` 라우트 구현
  - [x] validator 미들웨어 연동
  - [x] queryBuilder + Mongo aggregate 실행 연동
  - [x] 응답 포맷 `{ rows, pageSize, hasMore, nextCursor? }`
  - [x] 스모크 테스트 추가: `backend/scripts/smoke-data-query-endpoint.ts` (validation 경로)
- [x] `GET /api/customers/search?q=` 구현
  - [x] 최소 2글자 검증
  - [x] `prod.users` 기준 ID/ObjectId, name, email 검색
  - [x] 최대 20건 반환 (`{ customers: [{ id, name, email }] }`)
  - [x] 스모크 테스트 추가: `backend/scripts/smoke-customer-search-endpoint.ts`

### 기간 요청 대응 메모 (월말/분기/반기)
- [x] `POST /api/data/query`에 `total`(count) 옵션 노출 (`includeTotal`)
- [x] 대용량 채널 요청 대응 배치 조회 API 추가
  - [x] `POST /api/data/query-batch/conversations`
  - [x] 채널 청크 처리(`channelChunkSize`, 기본 50, 최대 100)
  - [x] 기간 월 단위 윈도우 분할 처리(6개월 요청 대비)
  - [x] 최대 500 채널 제한 + rowLimit 가드레일
  - [x] 처리 메타 반환(`processedChunks`, `elapsedMs`)
  - [x] dataType별 집계 응답 API 구현
    - [x] `POST /api/data/summary/by-data-type`
    - [x] 공통: `totalCount`
    - [x] `conversations`: `conversationCount`, `activeChannels`, `activeCreators`
    - [x] `api_usage_logs`: `creditsUsed`, `inputTokens`, `outputTokens`, `totalTokens`, `avgBalance`
    - [x] `billing_logs`: `expiredCount`
    - [x] `user_activities`: `publicCount`, `privateCount`
    - [x] `error_logs`: `uniqueErrorCodes`
- [x] 기간 집계 API 구현 (`credits/tokens` 포함)
  - [x] `POST /api/data/summary/period`
  - [x] `groupBy`: `month`, `quarter`, `halfyear`
  - [x] `api_usage_logs`: `creditsUsed`, `inputTokens`, `outputTokens`, `totalTokens`, `avgBalance`, `requestCount`
  - [x] `conversations`: `conversationCount`, `activeChannels`, `activeCreators`
  - [x] 성능 가드: 최대 190일 기간 제한, `customerId` 또는 `channelIds` 필수
- [x] 기간 설정 우선 정책 확정 (`dateRange.start/end` 직접 입력)
- [ ] 기간 프리셋 파라미터 생성(월/분기/반기/년)은 향후 개선으로 이관

### 기간 설정 정책 (현재)
- [x] 모든 조회/집계 API는 `dateRange.start/end` 기반 직접 기간 설정 사용
- [x] 프리셋 자동 생성 로직은 현재 범위에서 제외 (백로그)

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

### dataType 매핑 확정 (1차)
- `conversations` → `prod.chats` (`customerField: creator`, `timestampField: createdAt`)
- `api_usage_logs` → `prod.usagelogs` (`customerField: creator`, `timestampField: createdAt`)
- `event_logs` → `logdb.logentrydbs` (`customerField: user_id`, `timestampField: timestamp`)
- `error_logs` → `prod.errorlogs` (`customerField: ip`, `timestampField: createdAt`)
- `billing_logs` → `prod.userplanhistories` (`customerField: user`, `timestampField: createdAt`)
- `user_activities` → `prod.sessions` (`customerField: channel`, `timestampField: createdAt`)

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
│   ├── scripts/
│   │   ├── profile-mongo-readonly.cjs
│   │   └── smoke-schema-endpoint.ts
│   └── src/
│       ├── app.ts                 ← Express 앱 팩토리
│       ├── index.ts               ← 부트스트랩 (Mongo 연결 + listen)
│       ├── routes/
│       │   └── data.ts            ← /api/schema/:dataType
│       ├── services/
│       │   └── schemaProvider.ts
│       └── config/
│           ├── env.ts             ← Zod 환경변수 로더
│           ├── database.ts        ← MongoDB 연결 레이어
│           └── schema/
│               ├── conversations.ts
│               ├── api_usage_logs.ts
│               ├── event_logs.ts
│               ├── error_logs.ts
│               ├── billing_logs.ts
│               ├── user_activities.ts
│               ├── types.ts
│               └── index.ts
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
| 2026-02-14 | `/api/schema/:dataType` 응답 포맷 `{columns,filters}` 고정, schemaProvider/registry/6개 schema 스켈레톤 추가, 최소 스모크 테스트(정상+오류) 추가. |
| 2026-02-14 | Mongo read-only 보강 실사(sampleDocs=10) 기반으로 6개 dataType의 컬렉션/식별자/타임스탬프/필터 키 1차 확정 및 스키마 파일 반영. |
| 2026-02-14 | `backend/src/services/queryBuilder.ts` 구현(`buildAggregationPipeline`, `buildCountPipeline`) 및 `backend/scripts/smoke-query-builder.ts` 추가. |
| 2026-02-14 | `backend/src/middleware/validators.ts` 추가, `POST /api/data/query` 연동, `backend/scripts/smoke-data-query-endpoint.ts` 스모크 테스트 추가. |
| 2026-02-14 | `GET /api/customers/search?q=` 구현(`prod.users` 기준 2글자 이상, 최대 20건) 및 `backend/scripts/smoke-customer-search-endpoint.ts` 추가. |
| 2026-02-14 | `POST /api/data/query`에 `includeTotal` 옵션 추가, `total` 응답 지원(기간별 요청 대비). |
| 2026-02-14 | `POST /api/data/query-batch/conversations` 추가(최대 500채널, 월단위 윈도우+채널 청크 배치 처리) 및 `backend/scripts/smoke-conversation-batch-endpoint.ts` 추가. |
| 2026-02-14 | `POST /api/data/summary/period` 추가(월/분기/반기 집계, 크레딧/토큰/대화지표 포함) 및 `backend/scripts/smoke-period-summary-endpoint.ts` 추가. |
| 2026-02-14 | `POST /api/data/summary/by-data-type` 추가(공통 totalCount + dataType별 핵심 메트릭) 및 `backend/scripts/smoke-data-type-summary-endpoint.ts` 추가. |
| 2026-02-14 | Cloud Run 배포 리허설(runbook) 항목 추가: Revision 캡처/배포/헬스체크/롤백 검증/결과 기록. |
| 2026-02-14 | 기간 프리셋 파라미터 생성(월/분기/반기/년)은 향후 개선으로 보류하고, `dateRange` 직접 설정을 우선 정책으로 확정. |

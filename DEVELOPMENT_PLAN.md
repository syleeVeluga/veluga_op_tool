# 개발 계획서 — 고객 로그 데이터 추출 대시보드

> 본 문서는 PRD v1.2.1 (PRD_v1_2_1_CloudRun.md) 기반의 단계별 구현 계획입니다.
> Copilot 및 AI 보조 개발 시 컨텍스트 참조용으로 작성되었습니다.
> 최종 갱신: 2026-02-14

---

## 전체 구조 요약

```
React SPA (GitHub Pages) → Cloud Run Backend API → MongoDB Atlas (Read-Only)
```

- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui + TanStack Query
- **Backend**: Node.js + Express + TypeScript + MongoDB Driver
- **인증**: 이메일 기반 JWT, RBAC + 메뉴 권한
- **배포**: Frontend → GitHub Pages / Backend → Google Cloud Run

---

## Phase 1: 프로젝트 기반 보강 (M1 — 0.5주)

> ⚡ 상태: 부분 완료 (서버 스캐폴딩 + 배포 인프라 완료)

### 1-1. 공유 타입 정의
- [ ] `shared/types/` 폴더 생성
- [ ] `shared/types/filter.ts` — `FilterCondition`, `DateRange`, `FilterValue`
- [ ] `shared/types/query.ts` — `QueryRequest`, `QueryResponse`, `CursorInfo`
- [ ] `shared/types/schema.ts` — `DataType`, `SchemaColumn`, `SchemaFilter`, `DataTypeSchema`
- [ ] `shared/types/user.ts` — `UserRole`, `User`, `LoginRequest`, `LoginResponse`
- [ ] `shared/types/preset.ts` — `Preset`, `PresetCreateRequest`
- [ ] `shared/types/export.ts` — `ExportOptions`, `ExportFormat`
- [ ] `shared/types/index.ts` — barrel export

### 1-2. 환경변수 체계화
- [ ] `backend/.env.example` 작성
  ```
  MONGODB_URI=mongodb+srv://...
  MONGODB_DB_NAME=logdb
  JWT_SECRET=your-jwt-secret
  JWT_EXPIRES_IN=8h
  CORS_ORIGIN=https://your-org.github.io
  MAX_EXPORT_ROWS=10000
  CSV_TRUNCATE_LENGTH=5000
  MAX_CONCURRENT_EXPORTS=2
  QUERY_TIMEOUT_MS=30000
  PORT=8080
  ```
- [ ] `dotenv` 패키지 추가, `backend/src/config/env.ts` 환경변수 로더 작성

### 1-3. 프론트엔드 프로젝트 초기화
- [ ] `frontend/` — Vite + React + TypeScript 프로젝트 생성
- [ ] Tailwind CSS 설치 및 설정
- [ ] shadcn/ui 초기화 (Button, Select, Input, Dialog, Table, DatePicker 등)
- [ ] React Router v6 설치 및 라우트 구성
- [ ] TanStack Query (React Query v5) 설치 및 QueryClient 설정
- [ ] `frontend/.env.example` — `VITE_API_BASE_URL`
- [ ] `frontend/Dockerfile` (선택) 또는 GitHub Pages 배포 설정

### 1-4. 백엔드 의존성 추가
- [ ] `mongodb` — MongoDB Native Driver
- [ ] `jsonwebtoken` + `@types/jsonwebtoken` — JWT
- [ ] `bcrypt` + `@types/bcrypt` — 비밀번호 해싱
- [ ] `fast-csv` — CSV 생성/스트리밍
- [ ] `zod` — 입력 검증
- [ ] `dotenv` — 환경변수

### 1-5. 백엔드 디렉토리 구조 확장
- [ ] `backend/src/routes/` — auth.ts, data.ts, adminUsers.ts, presets.ts
  - [x] `data.ts` (schema 조회 라우트 스켈레톤)
- [ ] `backend/src/services/` — queryBuilder.ts, csvGenerator.ts, jsonExporter.ts, schemaProvider.ts
  - [x] `schemaProvider.ts` (columns/filters 반환)
- [ ] `backend/src/middleware/` — authz.ts, auditLogger.ts, errorHandler.ts
- [ ] `backend/src/models/` — User, Preset, AuditLog 타입/헬퍼
- [ ] `backend/src/config/` — env.ts, database.ts, schema/
  - [x] `schema/` 6개 dataType 스켈레톤 + registry 추가

---

## Phase 2: 스키마 설정 + 쿼리 빌더 (M2 — 1주)

> 전체 시스템의 핵심 기반 모듈

### 2-0. Production 무영향 스키마 실사 (선행 게이트)
- [x] `backend/scripts/profile-mongo-readonly.cjs`로 컬렉션/샘플 키/추정 건수 수집
- [ ] 원칙: Read-Only 쿼리만 사용 (insert/update/delete/index 작업 금지)
- [ ] 연결 옵션: `readPreference=secondaryPreferred`, `maxTimeMS` 적용
- [x] 산출물: `backend/reports/mongo-profile-*.json`
- [ ] 실사 결과 기준으로 dataType ↔ collection 매핑 및 필터 정의 확정

#### 2-0 실사 결과 (2026-02-14, 제한 샘플)
- DNS 우회 옵션(`MONGO_PROFILE_DNS_SERVERS=8.8.8.8,1.1.1.1`) 사용 시 read-only 프로파일링 성공
- `logdb.logentrydbs` 확인: 약 681만건, 키 `serverType/serviceType/action/category/details/timestamp/channel_id`
- `prod.sessions` 확인: 약 341만건, 키 `channel/participants/lastChat/createdAt/updatedAt`
- `prod.weburls` 확인: 약 1.1만건, 키 `domain/path/inputUrl/state/startTrainingAt/endTrainingAt`
- full-scan 완료: `backend/reports/mongo-profile-2026-02-14T06-19-07-163Z.json` (`prod` 58개, `logdb` 2개)

#### 2-0 실측 기반 dataType 매핑 확정 (1차)
- `conversations` → `prod.chats` (`customerField: creator`, `timestampField: createdAt`)
- `api_usage_logs` → `prod.usagelogs` (`customerField: creator`, `timestampField: createdAt`)
- `event_logs` → `logdb.logentrydbs` (`customerField: user_id`, `timestampField: timestamp`, 필터: `serverType/serviceType/action/category/subcategory/channel_id`)
- `error_logs` → `prod.errorlogs` (`customerField: ip`, `timestampField: createdAt`)
- `billing_logs` → `prod.userplanhistories` (`customerField: user`, `timestampField: createdAt`)
- `user_activities` → `prod.sessions` (`customerField: channel`, `timestampField: createdAt`)

> 참고: 2026-02-14 보강 실사(`sampleDocsPerCollection=10`) 리포트 `backend/reports/mongo-profile-2026-02-14T08-59-20-716Z.json`에서 `logentrydbs.channel_id`, `logentrydbs.user_id` 키를 추가 확인함.

### 2-1. 데이터 유형별 스키마 설정 파일
- [x] `backend/src/config/schema/conversations.ts` (스켈레톤)
  - collection: `conversations`, customerField: `userId`, timestampField: `timestamp`
  - 필터: 모델명(select), 토큰사용량(range)
- [x] `backend/src/config/schema/api_usage_logs.ts` (스켈레톤)
  - 필터: endpoint(search), method(select), statusCode(select)
- [x] `backend/src/config/schema/event_logs.ts` (스켈레톤)
  - 필터: eventType(select)
- [x] `backend/src/config/schema/error_logs.ts` (스켈레톤)
  - 필터: errorCode(search), severity(select: info/warn/error/critical)
- [x] `backend/src/config/schema/billing_logs.ts` (스켈레톤)
  - 필터: plan(select), status(select)
- [x] `backend/src/config/schema/user_activities.ts` (스켈레톤)
  - 필터: action(select), sessionId(search)
- [x] `backend/src/config/schema/index.ts` — dataType → schema 레지스트리 맵

### 2-2. 쿼리 빌더 엔진 (`backend/src/services/queryBuilder.ts`)
- [x] `buildAggregationPipeline(request: QueryRequest): Document[]`
  - 필수 검증: customerId + dateRange 존재 확인
  - $match 단계: customerField → customerId, timestampField → $gte/$lte
  - 동적 필터 적용: select → $eq, search → $regex(case-insensitive), range → $gte/$lte
  - $project 단계: 선택된 columns만 프로젝션
  - $sort: timestamp DESC 기본
  - $limit: MAX_EXPORT_ROWS (기본 10000)
  - seek pagination: afterTs + afterId 기반 커서
- [x] `buildCountPipeline(request: QueryRequest): Document[]` — total 카운트용
- [ ] 가드레일: 쿼리 타임아웃 30초, readPreference secondaryPreferred
- [ ] 단위 테스트 작성 (현재 스모크 테스트: `backend/scripts/smoke-query-builder.ts`)

### 2-3. 입력값 검증
- [x] `backend/src/middleware/validators.ts`
  - Zod 스키마: QueryRequest, ExportRequest, CustomerSearchRequest
  - NoSQL Injection 방지: `$` 접두사 키 차단, 타입 강제
  - dataType enum 검증

---

## Phase 3: 백엔드 API 구현 (M3 — 1주)

### 3-1. MongoDB 연결 (`backend/src/config/database.ts`)
- [ ] MongoClient 싱글턴, 연결풀링
- [ ] Read-Only 계정 접속 (NF-01)
- [ ] readPreference: secondaryPreferred
- [ ] graceful shutdown (SIGTERM 시 connection close)
- [ ] 연결 상태 확인 함수

### 3-2. 스키마 조회 API — `GET /api/schema/:dataType`
- [x] `backend/src/routes/data.ts` 라우트
- [x] `backend/src/services/schemaProvider.ts` — 레지스트리에서 columns/filters 반환
- [x] 잘못된 dataType → 400 에러
- [x] 최소 스모크 테스트 추가 (`backend/scripts/smoke-schema-endpoint.ts`)

### 3-3. 고객 검색 API — `GET /api/customers/search?q=`
- [x] 최소 2글자 입력 필요
- [x] 고객 컬렉션에서 ID/이름 regex 검색
- [x] 최대 20건 반환, 응답: `{ customers: [{ id, name, email }] }`

#### 3-3 구현 메모 (2026-02-14)
- `prod.users` 컬렉션 대상
- 검색 필드: `_id(ObjectId exact match)`, `name(regex)`, `email(regex)`
- readPreference: `secondaryPreferred`, maxTimeMS: `QUERY_TIMEOUT_MS`
- 스모크 테스트: `backend/scripts/smoke-customer-search-endpoint.ts`

### 3-4. 데이터 조회 API — `POST /api/data/query`
- [x] Zod 입력 검증 → queryBuilder로 파이프라인 생성 → MongoDB 실행
- [x] 응답: `{ rows, total?, pageSize, nextCursor?, hasMore }`
- [ ] 미리보기 기본 100행

#### 기간별 요청 대응 (월말/분기/반기) 후속
- [x] `POST /api/data/query`에 `includeTotal` 플래그 추가 및 `total` 반환
- [x] dataType별 기간 집계 응답(대화 건수, 사용량 합계 등) 구현
  - [x] `POST /api/data/summary/period`
  - [x] `groupBy`: month/quarter/halfyear
  - [x] usage 지표: `creditsUsed`, `inputTokens`, `outputTokens`, `totalTokens`, `avgBalance`, `requestCount`
  - [x] conversation 지표: `conversationCount`, `activeChannels`, `activeCreators`
- [x] 기간 집계 가드레일: 기간 최대 190일, `customerId` 또는 `channelIds` 필수

#### 기간 설정 정책 (2026-02-14 확정)
- [x] 현재 단계는 `dateRange.start/end` 직접 설정만 사용
- [ ] 프리셋 파라미터 생성(월/분기/반기/년)은 향후 개선 과제로 분리
- [x] 대용량 대화로그 배치 조회 API 구현
  - [x] `POST /api/data/query-batch/conversations`
  - [x] 최대 500 채널 제한
  - [x] 월 단위 기간 윈도우 분할 + 채널 청크 분할(기본 50)
  - [x] 응답 메타(`processedChunks`, `elapsedMs`, `hasMore`, `total?`)

### 3-5. CSV Export API — `POST /api/data/export-csv`
- [ ] `backend/src/services/csvGenerator.ts`
  - MongoDB Cursor → Transform Stream → fast-csv → HTTP Response
  - 문자열 5000자 Truncate (설정 가능)
  - Nested 데이터 플랫트닝 (`messages[0].content` → `messages_0_content`)
  - 파일명 자동생성: `{dataType}_{customerId}_{date}.csv`
- [ ] 동시 Export 세마포어 (MAX_CONCURRENT_EXPORTS)
- [ ] Content-Type: text/csv, Content-Disposition: attachment

### 3-6. JSON Export API — `POST /api/data/export-json`
- [ ] `backend/src/services/jsonExporter.ts`
  - MongoDB Cursor → JSON Array 스트리밍 → 선택적 gzip
  - Truncate 없이 원문
  - Content-Type: application/json 또는 application/gzip
- [ ] 동시 Export 세마포어 공유

### 3-7. 인증/인가
- [x] `backend/src/routes/auth.ts`
  - `POST /api/auth/login` — 이메일+비밀번호 → JWT 발급
  - JWT payload: `{ userId, email, role, allowedMenus, allowedDataTypes }`
- [x] `backend/src/middleware/authz.ts`
  - `authenticate` — JWT 검증 미들웨어
  - `authorize(roles)` — 역할 기반 접근 제어
  - `checkMenuAccess(menu)` — 메뉴 권한 검사
  - `checkDataTypeAccess(dataType)` — 데이터 유형 접근 검사
- [x] `GET /api/me` — 로그인 사용자 정보 반환

### 3-8. 관리자 사용자 관리 — `/api/admin/users`
- [x] `backend/src/routes/adminUsers.ts`
  - GET / — 사용자 목록 (Admin only)
  - POST / — 사용자 생성 (email, name?, role, allowedMenus, allowedDataTypes)
  - PUT /:id — 수정
  - DELETE /:id — 비활성화
- [x] User 스키마: `{ email, name, passwordHash, role, allowedMenus, allowedDataTypes, status, createdAt, updatedAt }`

### 3-9. 프리셋 API — `/api/presets`
- [ ] `backend/src/routes/presets.ts`
  - GET / — 내 프리셋 목록
  - POST / — 저장 `{ name, dataType, filters, columns }`
  - PUT /:id — 수정
  - DELETE /:id — 삭제
- [ ] 사용자별 격리 (JWT에서 userId 추출)

### 3-10. 감사 로그
- [ ] `backend/src/middleware/auditLogger.ts`
  - 조회/다운로드 요청마다 자동 기록
  - 저장: `{ userId, email, action, dataType, filters, resultCount, exportType, timestamp }`
- [ ] AuditLog 컬렉션에 저장

### 3-11. 에러 핸들링
- [ ] `backend/src/middleware/errorHandler.ts`
  - 전역 에러 핸들러, 구조화된 에러 응답
  - `{ error: { code, message, details? } }`

---

## Phase 4: 프론트엔드 — 레이아웃 + 필터 패널 (M4 — 1.5주)

### 4-1. 레이아웃
- [x] `frontend/src/layouts/DashboardLayout.tsx` — 헤더+사이드바+메인 구조 적용
- [x] `frontend/src/components/Sidebar.tsx` — 권한 기반 동적 메뉴 구현
- [x] 라우트 구성: `/` (dashboard), `/partner-logs`, `/admin/users`, `/login`

### 4-2. 인증 플로우
- [x] `frontend/src/pages/LoginPage.tsx` — 이메일+비밀번호 로그인 폼
- [x] `frontend/src/contexts/AuthContext.tsx` — 전역 인증 상태 및 로그인/로그아웃 관리
- [x] `frontend/src/App.tsx` — 인증 가드(`authGuard`) 및 라우팅 통합
- [x] JWT 저장: localStorage (`AUTH_SESSION_STORAGE_KEY`)

### 4-3. 필터 패널
- [x] `frontend/src/components/LogDashboard.tsx` — 필터 및 결과 뷰 통합 컴포넌트
- [x] 데이터 타입 선택 및 가이드 UI
- [x] 고객 검색 자동완성 (debounce 적용)
- [x] 날짜 범위 및 동적 스키마 필터 생성
- [x] 파트너 ID 조회 모드 지원

### 4-4. API 연동 훅
- [x] `frontend/src/lib/api.ts` — API 클라이언트 함수 모음
- [x] `frontend/src/lib/storage.ts` — 로컬 스토리지 상태 저장/복원 로직 분리

---

## Phase 5: 프론트엔드 — 결과 테이블 + 다운로드 (M5 — 1주)

### 5-1. 결과 테이블
- [x] `frontend/src/components/LogDashboard.tsx` 내 테이블 구현
  - Tailwind CSS 기반 스타일링, 동적 컬럼 렌더링
  - Nested JSON 데이터 표시 지원
- [ ] `frontend/src/components/ui/` — 공통 UI 컴포넌트 분리 (Skeleton, Table 등)

### 5-2. 컬럼 선택
- [x] 컬럼 토글 UI 구현 및 로컬 스토리지 저장

### 5-3. CSV 다운로드
- [x] 클라이언트 측 CSV 생성 및 다운로드 구현 (`buildCsvContent`)
  - (추후 백엔드 스트리밍 방식으로 고도화 검토)

### 5-4. JSON 전문 다운로드
- [x] JSON 파일 다운로드 기능 구현
  - JSON 다운로드 버튼 + gzip 옵션 토글

### 5-5. 메인 대시보드 페이지
- [ ] `frontend/src/pages/Dashboard.tsx` — FilterPanel + DataTable + ExportActions 통합

---

## Phase 6: 프리셋 + 히스토리 (M6 — 0.5주)

### 6-1. 프리셋 매니저
- [ ] `frontend/src/components/PresetManager/PresetManager.tsx`
  - 프리셋 저장 다이얼로그
  - 목록 표시 + 클릭 시 필터 자동 채움
  - 수정/삭제
- [ ] `frontend/src/hooks/usePresets.ts` — CRUD 연동

### 6-2. 조회 히스토리
- [ ] `frontend/src/components/QueryHistory/QueryHistory.tsx`
  - 최근 20건 이력, 재실행 기능
- [ ] `frontend/src/hooks/useQueryHistory.ts`

---

## Phase 7: 관리자 기능 (M7 — 0.5주)

### 7-1. 관리자 페이지
- [ ] `frontend/src/pages/AdminUsers.tsx`
  - 사용자 목록 테이블
  - 추가 폼: 이메일, 이름, 역할, 메뉴 권한(체크박스), 데이터 유형(체크박스)
  - 수정/비활성화

### 7-2. 메뉴 접근 제어 통합
- [ ] Sidebar에서 `allowedMenus` 기반 메뉴 필터링
- [ ] ProtectedRoute에서 메뉴 + 데이터 유형 접근 검사
- [ ] 직접 URL 접근 차단 → 403 안내 페이지

---

## Phase 8: 통합 테스트 + QA + 배포 (M8 — 1주)

### 8-1. 테스트
- [ ] 백엔드 단위 테스트: queryBuilder, csvGenerator, jsonExporter
- [ ] API 통합 테스트: 모든 엔드포인트
- [ ] UC-01~UC-06 시나리오 수동 검증
- [ ] 보안 테스트: NoSQL Injection, 권한 우회

### 8-2. 성능 검증
- [ ] 조회 응답 < 3초 (1000건 기준) — NF-08
- [ ] CSV 생성 < 5초 (10000건 기준) — NF-09
- [ ] 동시 사용자 10명 — NF-10

### 8-3. 배포
- [ ] Frontend GitHub Pages 배포 워크플로우 (`.github/workflows/deploy-frontend.yml`)
- [ ] Cloud Run CORS 설정 확정 (GitHub Pages 도메인만 허용)
- [ ] Secret Manager 연동 (선택)
- [ ] Production 전체 플로우 검증

---

## 주요 결정사항

| 항목 | 결정 | 근거 |
|------|------|------|
| DB 드라이버 | MongoDB Native Driver | Read-Only 조회 전용, Mongoose보다 가벼움 |
| 인증 | 이메일 + 비밀번호 + JWT | PRD 요구사항, SSO는 추후 교체 가능 |
| 개발 순서 | Backend-first | API가 준비된 상태에서 Frontend 개발 효율적 |
| CSV 라이브러리 | fast-csv | 스트리밍 지원, 대용량 처리 |
| 입력 검증 | Zod | TypeScript 타입 추론, 간결한 문법 |
| 페이지네이션 | Seek (cursor) 방식 | offset 방식 대비 대용량 데이터 성능 우수 |

---

## 참조 문서

- `PRD_v1_2_1_CloudRun.md` — 전체 요구사항 정의서
- `PROJECT_STATUS.md` — 구현 진행 상황 추적
- `ARCHITECTURE.md` — 아키텍처 결정 및 기술 참조

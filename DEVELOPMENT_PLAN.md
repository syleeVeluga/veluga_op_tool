# 개발 계획서 — 고객 로그 데이터 추출 대시보드

> 본 문서는 PRD v1.2.1 (PRD_v1_2_1_CloudRun.md) 기반의 단계별 구현 계획입니다.
> Copilot 및 AI 보조 개발 시 컨텍스트 참조용으로 작성되었습니다.
> 최종 갱신: 2026-02-18
> 운영 기준의 최신 완료 상태는 `PROJECT_STATUS.md`를 우선하며, 본 문서의 일부 초기 체크리스트는 이력 보존용입니다.

---

## 전체 구조 요약

```
React SPA (GitHub Pages) → Cloud Run Backend API → MongoDB Atlas (Read-Only)
```

- **Frontend**: React + TypeScript + Tailwind CSS + React Router
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
- [x] `backend/.env.example` 작성
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
- [x] `dotenv` 패키지 추가, `backend/src/config/env.ts` 환경변수 로더 작성

### 1-3. 프론트엔드 프로젝트 초기화
- [x] `frontend/` — Vite + React + TypeScript 프로젝트 생성
- [x] Tailwind CSS 설치 및 설정
- [ ] shadcn/ui 초기화 (Button, Select, Input, Dialog, Table, DatePicker 등)
- [ ] React Router v6 설치 및 라우트 구성
- [ ] TanStack Query (React Query v5) 설치 및 QueryClient 설정
- [ ] `frontend/.env.example` — `VITE_API_BASE_URL`
- [ ] `frontend/Dockerfile` (선택) 또는 GitHub Pages 배포 설정

### 1-4. 백엔드 의존성 추가
- [x] `mongodb` — MongoDB Native Driver
- [x] `jsonwebtoken` + `@types/jsonwebtoken` — JWT
- [ ] `bcrypt` + `@types/bcrypt` — 비밀번호 해싱
- [ ] `fast-csv` — CSV 생성/스트리밍
- [x] `zod` — 입력 검증
- [x] `dotenv` — 환경변수

### 1-5. 백엔드 디렉토리 구조 확장
- [ ] `backend/src/routes/` — auth.ts, data.ts, adminUsers.ts, presets.ts
  - [x] `data.ts` (schema 조회 라우트 스켈레톤)
- [ ] `backend/src/services/` — queryBuilder.ts, csvGenerator.ts, jsonExporter.ts, schemaProvider.ts
  - [x] `schemaProvider.ts` (columns/filters 반환)
- [ ] `backend/src/middleware/` — authz.ts, auditLogger.ts, errorHandler.ts
- [ ] `backend/src/models/` — User, Preset, AuditLog 타입/헬퍼
- [x] `backend/src/config/` — env.ts, database.ts, schema/
  - [x] `schema/` 6개 dataType 스켈레톤 + registry 추가

---

## Phase 2: 스키마 설정 + 쿼리 빌더 (M2 — 1주)

> 전체 시스템의 핵심 기반 모듈

### 2-0. Production 무영향 스키마 실사 (선행 게이트)
- [x] `backend/scripts/profile-mongo-readonly.cjs`로 컬렉션/샘플 키/추정 건수 수집
- [x] 원칙: Read-Only 쿼리만 사용 (insert/update/delete/index 작업 금지)
- [x] 연결 옵션: `readPreference=secondaryPreferred`, `maxTimeMS` 적용
- [x] 산출물: `backend/reports/mongo-profile-*.json`
- [x] 실사 결과 기준으로 dataType ↔ collection 매핑 및 필터 정의 확정

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

#### 2-0 정산 관점 추가 실사 결과 (2026-02-15)
- [x] Read-Only 재실사로 `billing_logs` 관련 실사용 컬렉션 재확인
  - 핵심: `prod.userplans`(6126), `prod.userplanhistories`(6965), `prod.plans`(10), `prod.businessplans`(1)
  - 참고: `prod.businessplanhistories`는 0건
- [x] 고객 유형 분포 확인: `userplans.isBusiness` 기준 일반 5890 / 비즈니스 236
- [x] 정산 근거 데이터 범위 확인
  - 구독 상태/이력: `userplans`, `userplanhistories`
  - 요금제 마스터/가격: `plans.price(KRW/USD/JPY)`, `discount`, `state`
  - 사용량 원장: `usagelogs.amount/balance/type`, `transactions.refId/refType/details.usage`
  - 운영 감사 로그: `logdb.logentrydbs`의 `category=Billing` 1238건 (주로 create/update 이벤트)
- [x] 리스크 확인
  - `userplanhistories.usage` 타입 혼재(`missing/int/object`)
  - `userplans.currentPlan -> plans` 조인 미매칭 일부 존재(약 2.3%)
  - 명시적 `invoice/refund/receipt` 구조 컬렉션 부재

#### 2-1A. billing_logs 구체안 (MVP + 정산 고려)

##### A) 데이터 소스/조인 전략
- [ ] 기본 원장: `prod.userplans`
- [x] 이력 원장: `prod.userplanhistories`
- [x] 플랜 메타 조인: `prod.plans` (`currentPlan`/`plan` 기준)
- [ ] 보조 근거: `prod.usagelogs` (사용량), `logdb.logentrydbs(category=Billing)` (운영 이벤트)

##### B) 서비스 로그 > 결제 로그 MVP 컬럼
- [x] 필수 컬럼
  - `createdAt` (기준 시각)
  - `user` (고객 ID)
  - `isBusiness` (고객 유형)
  - `currentPlan` / `plan` (플랜 ID)
  - `planName`, `planState`, `planPriceKRW`, `planPriceUSD`, `discount` (plans 조인)
  - `paymentDate`, `lastPaymentDate`, `expiresAt`, `deletedAt`
  - `expired`, `expiredAt` (이력 기반)
- [ ] 확장 컬럼 (2차)
  - `usage.numOfChat`, `usage.numOfChannel`, `usage.numOfCharacter`
  - `available.numOfChat`, `available.numOfChannel`, `available.numOfCharacter`
  - `nextPlan`, `paymentDateBeforeUnsubscribe`, `reason`

##### C) 필터/검색 (MVP)
- [x] 기간 필터: `createdAt` (기본), 필요 시 `paymentDate` 보조
- [x] 고객 유형: `isBusiness` (true/false)
- [x] 플랜: `planName`(select), `planState`(ACTIVE/INACTIVE)
- [x] 상태 필터: `expired`(값 존재 시), `deletedAt`(null/not null)
- [x] 식별 검색: `user`, `planId` (`currentPlan`/`plan`)

##### D) 집계 카드 (MVP)
- [ ] 고객 유형별 활성 구독 수 (`isBusiness`, `deletedAt=null` 기준)
- [ ] 플랜별 구독 수 (`planName` 기준)
- [ ] 만료 예정/만료 건수 (`expiresAt`, `expiredAt` 기준)
- [ ] 최근 결제일 분포 (`paymentDate`, `lastPaymentDate` 존재율)

##### E) 정산 안전장치/예외 규칙
- [x] `usage` 정규화 규칙
  - number/object/missing 혼재 대응: 서버에서 `normalizedUsage` 생성
  - 파싱 실패 시 원본 유지 + `usageNormalizationStatus` 부여
- [x] 플랜 조인 실패 규칙
  - `planName='UNKNOWN_PLAN'`, `planState='UNKNOWN'`, 원본 `planId` 표시
- [ ] 금액 표기 원칙
  - MVP는 `plans.price` 기준 "요금제 기준 금액"으로만 표기
  - 실결제 금액/환불 금액은 외부 PG 정산 연동 전까지 "미지원" 명시
- [ ] 운영 이벤트 보조 규칙
  - `logentrydbs(category=Billing)`는 감사 로그 용도(정산 금액 산식에 직접 사용 금지)

##### F) 구현 작업 항목 (다음 단계 반영)
- [x] `backend/src/config/schema/billing_logs.ts` 구체화
  - 컬럼/필터 정의를 위 MVP 기준으로 확정
- [x] `backend/src/services/queryBuilder.ts` 보강
  - `billing_logs` 전용 `$lookup(plans)` + 안전 projection
  - `usage` 정규화 projection 추가
- [x] `backend/src/services/periodSummary.ts` 보강
  - `billing_logs` 요약 지표(활성/만료/플랜분포) 추가
- [x] `frontend/src/pages/ServiceLogPage.tsx` / `LogDashboard.tsx` 보강
  - [x] `billing_logs` 선택 시 컬럼 기본셋/필터셋 적용
  - [x] "요금제 기준 금액" 안내 문구 표시

#### 2-1B. 비IT 사용자 사용성 검토 (2026-02-15)
- [x] 1차 결론: 현재 UI는 비IT 사용자도 운영 가능(고객검색/기본필터/다운로드 흐름 확보)
- [x] 헷갈림 완화 반영: `billing_logs` 기본 필터(`deletedState=active`) 및 기본 컬럼셋 자동 적용
- [x] 정산 오해 방지 반영: "요금제 기준 금액(plans.price), 실결제/환불 미지원" 문구 노출
- [ ] 후속 개선(우선순위)
  - [x] 라벨 현지화: `Data Type`, `Customer ID`, `Include Total` 등 영문 UI 문구 한글화
  - 용어 단순화: `billing_logs` 표기를 `결제 로그` 중심으로 통일
  - 초심자 모드 가이드: 첫 진입 시 3단계 사용 안내(고객 선택 → 기간 선택 → 조회/다운로드)

#### 2-1C. 파트너 기관 대화 로그 추출 계획 (2026-02-15)

> 배경: 파트너 계정(학교/기업 독립 클라우드 운영)에서 기관 단위 전체 대화 로그를 요청하며,
> 현재 전제는 Production DB Read-Only 접근만 가능.

- [x] 조사 결론: 현재 구조로 "기관 단위 대화 로그 추출"은 가능
  - 근거 1) 파트너 → 멤버 고객 ID 확장 로직 존재 (`users.members` + owner)
  - 근거 2) 대화 리포트/배치 조회/CSV·JSON export 경로 존재
  - 근거 3) readPreference, maxTimeMS, 청크 분할 등 저부하 가드레일 기반 운영 가능
- [x] 핵심 원칙 확정
  - 2트랙 운영: 단기(오프라인 스크립트) + 중기(API 표준화)
  - DB 영향 최소화: 월 단위 윈도우 + 고객/채널 청크 + 낮은 동시성
  - 기관 범위: `users.members` 기준 + 보조 검증 쿼리 병행
  - 보안: 권한 보유 운영자만 실행 + 감사로그 필수

##### A) 파트너 추출 범위 및 출력 컬럼
- [x] 필수 출력(요청 반영)
  - `questionText` (사용자 질문)
  - `finalAnswerText` (AI 최종 답변)
  - `creditUsed` (질의 기준 사용 크레딧)
  - `like` (좋아요/나빠요/없음)
  - `finalAnswerModel` (최종 답변 모델)
- [x] 기본 식별/시간 컬럼
  - `occurredAt` (질문 시각)
  - `customerId` (질문자 ID)
  - `channel`, `sessionId`
- [x] 내부 보고 확장 컬럼 (1차)
  - `questionCreatorType`, `questionCreatorRaw` (누가 질문했는지 강화)
  - `answerAt` (응답 시각), `responseLatencyMs` (질문→응답 지연)
  - `matchSource` (direct/nearby/fallback/unmatched)
  - `modelConfidence`, `likeConfidence` (파생값 신뢰도)

##### B) 구현 트랙
- [x] Track 1 — DB 오프라인 추출 스크립트 (운영 요청 즉시 대응)
  - 위치: `backend/scripts/` 신규 스크립트 추가
  - 플로우: `partnerId` → 멤버 확장 → 기간 월분할 → 고객/채널 청크 조회 → 파일 출력
  - 기본값: `customerBatchSize=200`, `channelChunkSize=25`, `maxWorkers=1~2`, `includeTotal=false`
  - 재시작: `resumeCursor(createdAt,_id)` 기반 체크포인트
- [x] Track 2 — API 표준 워크플로우 (반복 운영/권한 통제)
  - 플로우: 파트너 멤버 해석 → 채널 해석 → 대화 배치 조회 API → export API 연계
  - 운영 파라미터를 환경변수/요청값으로 통제

##### C) 저부하 운영 가드레일 (필수)
- [x] 쿼리 기본 정책
  - `readPreference=secondaryPreferred`
  - `maxTimeMS` 강제
  - 필요한 컬럼만 projection
  - 월 단위 기간 윈도우 고정(장기 기간 일괄 조회 금지)
- [x] 실행 정책
  - 동시 실행 수 제한(기본 1, 최대 2)
  - 청크 간 짧은 휴지시간 도입(과부하 완화)
  - 실패 청크 재시도(최대 횟수 제한) + 실패 목록 리포트

##### D) 보안/감사(게이트)
- [ ] 데이터 추출 라우트 인증/인가 강제
  - 권한 보유 운영자만 파트너 단위 대량 추출 실행 가능
- [ ] 감사 로그 필수 저장
  - `actorUserId`, `actorEmail`, `action`, `partnerId`, `dateRange`, `resultCount`, `elapsedMs`, `status`, `requestedAt`
  - 정산/감사 목적의 추출 이력 추적 가능해야 함

##### E) 검증 및 완료 기준
- [ ] 정확도 검증
  - 동일 기간에서 서비스 로그 조회 결과와 샘플 대조(질문/답변/크레딧/like/모델)
  - `users.members` 대비 실제 추출 고객 포함률 점검(누락/중복 보고)
- [ ] 성능/안정성 검증
  - 청크 단위 `elapsedMs`, timeout 비율, 재시도율 수집
  - 운영 임계치 초과 시 청크/동시성 파라미터 자동 하향
- [ ] 산출물 표준화
  - 상세 파일 + 실행 요약 파일(요청자/시각/범위/건수/실패 청크)

### 2-1. 데이터 유형별 스키마 설정 파일
- [x] `backend/src/config/schema/conversations.ts` (스켈레톤)
  - collection: `prod.chats`, customerField: `creator`, timestampField: `createdAt`
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
- [x] 가드레일: 쿼리 타임아웃 30초, readPreference secondaryPreferred
- [ ] 단위 테스트 작성 (현재 스모크 테스트: `backend/scripts/smoke-query-builder.ts`)

### 2-3. 입력값 검증
- [x] `backend/src/middleware/validators.ts`
  - Zod 스키마: QueryRequest, ExportRequest, CustomerSearchRequest
  - NoSQL Injection 방지: `$` 접두사 키 차단, 타입 강제
  - dataType enum 검증

---

## Phase 3: 백엔드 API 구현 (M3 — 1주)

### 3-1. MongoDB 연결 (`backend/src/config/database.ts`)
- [x] MongoClient 싱글턴, 연결풀링
- [ ] Read-Only 계정 접속 (NF-01)
- [x] readPreference: secondaryPreferred
- [x] graceful shutdown (SIGTERM 시 connection close)
- [x] 연결 상태 확인 함수

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
- [x] 미리보기 기본 100행

#### 3-4A. 파트너 기관 대화 로그 추출 API/운영 연계 (신규)
- [x] 파트너 단위 조회 파라미터 표준화 (`partnerId`, `dateRange`, `chunkOptions`)
- [x] 파트너 멤버 확장 + 보조 검증 결과를 응답 메타에 포함
- [x] 내부 보고용 추가 컬럼(`questionCreatorType`, `answerAt`, `responseLatencyMs`) 지원
- [x] 장기 기간 요청 시 강제 윈도우 분할(월 단위) 및 실행 계획 반환
- [x] 대량 추출 요청에 대해 `job-like` 실행 메타(`processedChunks`, `failedChunks`, `elapsedMs`) 제공
- [x] 파트너 전용 다운로드 API 추가
  - [x] `POST /api/data/query-partner/conversations/export-csv`
  - [x] `POST /api/data/query-partner/conversations/export-json`
  - [x] `gzip=1` 옵션 지원(JSON)

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
- [x] `backend/src/services/exportStreaming.ts` 기반 CSV 스트리밍 구현
  - MongoDB Cursor/보고서 row → HTTP Response 스트리밍
  - 파일명 자동생성: `{dataType}-{timestamp}.csv`
  - Content-Type: `text/csv; charset=utf-8`, Content-Disposition: attachment
- [x] 동시 Export 세마포어 (MAX_CONCURRENT_EXPORTS)
- [x] 라우트 연결: `backend/src/routes/data.ts` (`POST /api/data/export-csv`)
- [x] 원칙 준수: Production DB Read-Only (insert/update/delete/index 작업 없음)

### 3-6. JSON Export API — `POST /api/data/export-json`
- [x] `backend/src/services/exportStreaming.ts` 기반 JSON 스트리밍 구현
  - MongoDB Cursor/보고서 row → JSON Array 스트리밍
  - Content-Type: `application/json; charset=utf-8`
- [x] 선택적 gzip (`POST /api/data/export-json?gzip=1`)
- [x] 동시 Export 세마포어 공유
- [x] 라우트 연결: `backend/src/routes/data.ts` (`POST /api/data/export-json`)
- [x] 원칙 준수: Production DB Read-Only (insert/update/delete/index 작업 없음)

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
- [ ] 파트너 추출 감사 필드 확장
  - 저장: `{ actorUserId, actorEmail, partnerId, memberCount, dateRange, processedChunks, failedChunks, elapsedMs, status, requestedAt }`

### 3-11. 에러 핸들링
- [x] `backend/src/middleware/errorHandler.ts`
  - 전역 에러 핸들러, 구조화된 에러 응답
  - `{ error: { code, message, details? } }`를 

---

## Phase 4: 프론트엔드 — 레이아웃 + 필터 패널 (M4 — 1.5주)

### 4-1. 레이아웃
- [x] `frontend/src/layouts/DashboardLayout.tsx` — 헤더+사이드바+메인 구조 적용
- [x] `frontend/src/components/Sidebar.tsx` — 권한 기반 동적 메뉴 구현
- [x] 라우트 구성: `/` (user logs), `/service-logs`, `/admin/users`, `/login`
- [ ] 라우트 추가: `/partner-logs` (파트너 기관 로그 전용)

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

### 4-5. 파트너 로그 메뉴/페이지 신설 (MVP)
- [x] `frontend/src/pages/PartnerLogPage.tsx` 신규
  - 파트너 ID 입력/선택, 기간 선택, 실행 버튼, 진행 메타 표시
  - CSV/JSON 다운로드 버튼 + JSON gzip 옵션
- [x] `frontend/src/components/Sidebar.tsx` 메뉴 항목 추가
  - 메뉴명: `파트너 로그`
  - 권한 없는 사용자 비노출
- [x] `frontend/src/App.tsx` 라우트/가드 추가
  - `/partner-logs` 접근 시 메뉴 권한 + 데이터 권한 동시 검사
- [x] `frontend/src/components/LogDashboard.tsx`와 역할 분리
  - 일반 서비스 로그 흐름과 파트너 대량 추출 흐름 분리
- [x] UX 가드레일
  - 장기 기간 요청 시 월 단위 자동 분할 안내
  - 기본 동시성/청크 정책 안내 문구 노출

---

## Phase 5: 프론트엔드 — 결과 테이블 + 다운로드 (M5 — 1주)

### 5-1. 결과 테이블
- [x] `frontend/src/components/LogDashboard.tsx` 내 테이블 구현
  - Tailwind CSS 기반 스타일링, 동적 컬럼 렌더링
  - Nested JSON 데이터 표시 지원
- [x] `frontend/src/components/ui/` — 공통 UI 컴포넌트 분리 (Skeleton, Table 등)

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
- [x] `frontend/src/pages/AdminPage.tsx` (기존 파일명 유지)
  - 사용자 목록 테이블 (역할 배지, 상태 배지, 메뉴/데이터 권한 배지)
  - 추가 폼 (모달): 이메일, 이름, 비밀번호, 역할, 계정 상태, 메뉴 권한(체크박스), 데이터 유형(체크박스)
  - 편집 모달: 이메일, 이름, 역할, 상태, 새 비밀번호(선택), 메뉴 권한, 데이터 유형
  - 비활성화/활성화 토글 + 하드 삭제
  - `Modal`, `Checkbox` UI 컴포넌트 신규 추가 (`frontend/src/components/ui/`)
  - allowedMenus/allowedDataTypes: UI 미리보기 구현 완료 (백엔드 연동은 7-2에서)

### 7-2. 메뉴 접근 제어 통합
- [ ] Sidebar에서 `allowedMenus` 기반 메뉴 필터링
- [ ] ProtectedRoute에서 메뉴 + 데이터 유형 접근 검사
- [ ] 직접 URL 접근 차단 → 403 안내 페이지
- [ ] `partner-logs` 전용 권한 키 추가 (`allowedMenus`)
  - 권한 보유 운영자만 메뉴 노출/URL 접근 허용

---

## Phase 8: 통합 테스트 + QA + 배포 (M8 — 1주)

### 8-1. 테스트
- [x] TypeScript 컴파일 검사 통과 (백엔드 + 프론트엔드 `tsc --noEmit`, 2026-02-18)
- [x] Smoke 테스트 실행 (2026-02-18, 커밋 `a0ca77e`)
  - ✅ schema-endpoint / query-builder / data-query / customer-search
  - ✅ conversation-batch / period-summary / data-type-summary / conversation-session-mapping
  - ❌ auth-inactive-login: 로컬 MongoDB Atlas DNS 연결 불가 (운영 환경 통과 예상)
  - ⏭️ partner-workflow: `SMOKE_PARTNER_ID` 미설정 스킵
- [ ] 백엔드 단위 테스트 추가: queryBuilder, csvGenerator, jsonExporter
- [ ] UC-01~UC-06 시나리오 수동 검증
- [ ] 보안 테스트: NoSQL Injection, 권한 우회

### 8-2. 성능 검증
- [ ] 조회 응답 < 3초 (1000건 기준) — NF-08
- [ ] CSV 생성 < 5초 (10000건 기준) — NF-09
- [ ] 동시 사용자 10명 — NF-10
- [ ] 파트너 대량 추출 부하 검증
  - 월 단위/청크 단위 실행 시 프로덕션 DB 영향(타임아웃, 지연) 임계치 이내 확인
  - 기본 동시성(1~2)에서 기관 규모별 완료 시간 산정표 작성

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

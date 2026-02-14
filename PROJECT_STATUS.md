# 프로젝트 진행 상황 — 고객 로그 데이터 추출 대시보드

> 최종 갱신: 2026-02-15
> 전체 진행률: ~90%

---

## 현재 상태 요약

| Phase | 설명 | 상태 | 진행률 |
|-------|------|------|--------|
| Phase 1 | 프로젝트 기반 보강 | 🟡 부분 완료 | 55% |
| Phase 2 | 스키마 설정 + 쿼리 빌더 | 🟡 진행중 | 65% |
| Phase 3 | 백엔드 API 구현 | 🟡 진행중 | 78% |
| Phase 4 | 프론트엔드 레이아웃 + 필터 | 🟡 진행중 | 94% |
| Phase 5 | 프론트엔드 결과/다운로드 | 🟡 진행중 | 52% |
| Phase 6 | 프리셋 + 히스토리 | ⬜ 미시작 | 0% |
| Phase 7 | 관리자 기능 | 🟡 진행중 | 48% |
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
  - `-CanaryPercent`/`-PromoteCanary` 기반 카나리 트래픽 전환/승격 지원
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
- [x] `gcloud` CLI 설치 확인 (`gcloud --version`)
- [x] `gcloud` 인증 확인 (`gcloud auth list`)
- [x] 대상 프로젝트 확인 (`gcloud config get-value project`)

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
- [x] 배포 전 현재 Revision 캡처
  - [x] `gcloud run revisions list --service log-csv-api --region asia-northeast3 --limit 1 --sort-by "~metadata.creationTimestamp"`
- [x] 리허설 배포 실행
  - [x] `./scripts/deploy-cloudrun.ps1`
- [ ] 자동 헬스체크 PASS 확인 (`/health`, `/api/health`, `/api/schema/api_usage_logs`)
- [x] 롤백/복구 상태 확인
  - [x] 신규 Revision `log-csv-api-00004-4xd` 생성 확인
  - [x] 서비스 트래픽이 기존 안정 Revision `log-csv-api-00003-kb6` 100% 유지 확인
- [x] 리허설 결과 기록 (성공/실패, 소요시간, 이슈)

##### 리허설 결과 (2026-02-14)
- 결과: **실패(신규 Revision Ready 실패) / 서비스 가용성 유지(기존 Revision 100%)**
- 원인: 신규 Revision에서 `MONGODB_URI is required to connect to MongoDB`로 부팅 실패
- 확인 로그: `resource.labels.revision_name=log-csv-api-00004-4xd` 에서 startup probe 실패 확인
- 후속 조치: 다음 리허설은 `-SetEnvVars`로 `MONGODB_URI` 포함해 재실행

##### 리허설 재검증 (MONGODB_URI 고정 전제)
- [x] 정상 이미지 기반 `--no-traffic` 리비전 생성/기동 확인
  - [x] Revision: `log-csv-api-reh203921` (Ready=True)
- [x] 운영 트래픽 안정성 확인
  - [x] `log-csv-api-00003-kb6` 100% 유지
- [x] 운영 헬스 엔드포인트 확인
  - [x] `/health` 200
  - [x] `/api/health` 200

#### 7) 카나리 트래픽 전환 준비 (신규)
- [x] 배포 스크립트 카나리 옵션 구현
  - [x] `-CanaryPercent <1~99>`: 신규 Revision 무트래픽 배포 후 분할 전환
  - [x] 카나리 실패 시 이전 안정 Revision 100% 자동 롤백
  - [x] `-PromoteCanary`: 헬스체크 통과 시 신규 Revision 100% 승격
- [ ] 실서비스 카나리 10% 1회 실행 및 결과 기록
  - 실행 예시:
    - `./scripts/deploy-cloudrun.ps1 -CanaryPercent 10 -PromoteCanary -SetEnvVars "NODE_ENV=production","MONGODB_URI=<SECRET>","MONGODB_DB_NAME=logdb","OPS_TOOL_DB_NAME=ops_tool","CORS_ORIGIN=*"`

### Phase 1 잔여
- [ ] `shared/types/` — 공유 TypeScript 타입 정의
- [x] `frontend/` — React 프로젝트 초기화 (Vite + Tailwind)
- [ ] 백엔드 추가 의존성: jsonwebtoken, bcrypt, fast-csv
- [ ] 백엔드 디렉토리 구조: routes/, services/, middleware/, models/, config/

### Phase 4 (착수)
- [x] `frontend/` Vite + React + TypeScript 스캐폴딩
- [x] Tailwind CSS 기본 설정 (`tailwind.config.js`, `postcss.config.js`, `src/index.css`)
- [x] MVP 대시보드 레이아웃 초안 (`frontend/src/App.tsx`)
- [x] 기본 반응형 브레이크포인트 적용 (`sm`, `lg` 레이아웃 분기)
- [x] API 연동용 클라이언트 레이어 구성 (`/api/schema`, `/api/data/query`)
- [x] 필터 폼(고객/기간/데이터유형 + 스키마 동적 필터) 1차 구현
- [x] 조회 결과 테이블 렌더링 + 기본 메타(`rows`, `total`, `hasMore`) 노출
- [x] 고객 검색 자동완성(`GET /api/customers/search`) 연동
- [x] 고객 검색 UI를 필터 패널 상단으로 재배치
- [x] 결과 테이블 컬럼 선택/숨김 UX 정리
- [x] 컬럼 설정 상태 저장(localStorage) 적용
- [x] 조회 조건(기간/페이지 크기) 상태 저장(localStorage) 적용
- [x] 데이터 타입/총건수 옵션(includeTotal) 상태 저장(localStorage) 적용
- [x] 필터값(customerId + schema filters) 상태 저장(localStorage) 적용
- [x] 결과 영역 실행 이력(최근 10건) 표시
- [x] 고객 기준 채널 조회/선택 UX 추가(1단계 채널 조회, 2단계 로그 조회)
- [x] `conversations` 데이터 타입에서 채널 선택 시 자동 로그 조회

### Phase 5 (착수)
- [x] 결과 영역 액션 버튼 뼈대 추가 (CSV/JSON)
  - [x] `frontend/src/App.tsx` 결과 헤더에 CSV/JSON 다운로드 버튼 배치
  - [x] 조회 결과 없을 때 비활성화 상태 처리
  - [x] 클릭 시 Phase 5 연동 예정 안내 문구(placeholder) 표시
- [x] CSV/JSON 다운로드 1차 구현 (클라이언트 저장)
  - [x] 표시 컬럼(result columns) 기준으로 내보내기 데이터 생성
  - [x] CSV escaping 및 UTF-8 BOM 적용
  - [x] JSON pretty-print(2-space) 파일 저장
  - [x] 데이터타입+타임스탬프 파일명 적용
- [x] 운영자 조회 가이드 UX 보강
  - [x] Data Type별 의미/식별자 키 안내 카드 추가
  - [x] Customer ID 입력 힌트/예시를 Data Type별로 동적 표시
  - [x] 사용자 검색 가능 Data Type에서만 자동완성 노출 (이외 직접 입력 안내)
- [x] Partner ID 기반 다중 사용자 조회 지원 (`users.members`)
  - [x] `GET /api/customers/by-partner?partnerId=` 추가 (`backend/src/routes/data.ts`)
  - [x] partner ID → 사용자 ID 배열 해석 서비스 추가 (`backend/src/services/customerSearch.ts`)
  - [x] `POST /api/data/query`가 `customerId` 또는 `customerIds`를 허용하도록 확장
  - [x] 프론트 필터 패널에 Partner ID 입력/해석 UX 및 멤버수 표시 추가

### Phase 7 (착수)

- [x] 인증/사용자 관리 백엔드 1차 구현
  - [x] `POST /api/auth/login` (이메일+비밀번호 로그인, JWT 발급)
  - [x] `GET /api/auth/me` (현재 로그인 사용자 확인)
  - [x] `POST /api/auth/change-password` (로그인 사용자 비밀번호 변경)
  - [x] `GET/POST/PUT/DELETE /api/admin/users` (사용자 추가/조회/수정/삭제)
  - [x] RBAC 미들웨어 추가 (`super_admin`, `admin`, `user`)
- [x] 슈퍼어드민 부트스트랩 정책 추가
  - [x] 기본 슈퍼어드민 이메일: `syleee@veluga.io`, `sylee@veluga.io`
  - [x] 슈퍼어드민 다중 계정 지원 (`SUPER_ADMIN_EMAILS` CSV)
  - [x] 초기 비밀번호 변경 강제 플래그(`mustChangePassword`) 도입
- [x] 프론트 관리자 기능 1차 구현 (`frontend/src/App.tsx`)
  - [x] 로그인/로그아웃 UI
  - [x] 사용자 메뉴 내 비밀번호 변경 UI
  - [x] 관리자/슈퍼어드민 사용자 추가 UI
  - [x] 관리자/슈퍼어드민 사용자 목록 + 역할변경/활성토글/암호재설정/삭제
- [x] 프론트 관리자 기능 2차 보강
  - [x] 사용자 목록 인라인 편집(이메일/이름 입력 후 저장)
- [x] 인증 스모크 테스트 보강
  - [x] 비활성 사용자 로그인 차단 시나리오 스크립트 추가
    - `backend/scripts/smoke-auth-inactive-login.ts`
    - `npm run test:smoke:auth-inactive-login`
  - [x] 로컬 환경에서 `MONGODB_URI` 미설정 시 skip 처리(오탐 방지)

#### Phase 7 남은 항목 (현재 범위)

- [ ] 권한 세분화
  - [ ] 백엔드 권한 매트릭스 확정 (`super_admin`, `admin`, `user`)
  - [ ] 관리자 API별 최소 권한 재정의 (`/api/admin/users` 세부 액션 단위)
  - [ ] 데이터 조회/다운로드 API 접근권한 분리(조회, 집계, 배치, 내보내기)
  - [ ] 프론트 메뉴/버튼 가시성 권한 반영 (역할별 노출/비노출)
  - [ ] 권한 부족 시 공통 에러 UX 정리 (`403` 안내 문구/동선)
  - [ ] 권한 케이스 스모크 테스트 추가 (허용/거부 시나리오)

#### Phase 7 후순위(범위 제외)

- [ ] 감사 로그(Audit Log) 구현
  - [ ] 나중에 진행 예정 (현재 Phase 7 진행 범위에서 제외)

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
| 2026-02-14 | Cloud Run 리허설 1회 실행: 신규 Revision(`log-csv-api-00004-4xd`) 기동 실패(`MONGODB_URI` 누락), 트래픽은 기존 안정 Revision(`log-csv-api-00003-kb6`) 100% 유지 확인. |
| 2026-02-14 | `MONGODB_URI` 고정 전제 재검증: `--no-traffic` 리허설 Revision(`log-csv-api-reh203921`) Ready 확인, 운영 트래픽(`log-csv-api-00003-kb6` 100%) 및 `/health`,`/api/health` 정상 확인. |
| 2026-02-14 | 기간 프리셋 파라미터 생성(월/분기/반기/년)은 향후 개선으로 보류하고, `dateRange` 직접 설정을 우선 정책으로 확정. |
| 2026-02-14 | Phase 5 다운로드 1차(클라이언트 CSV/JSON) 반영 후 전체 리뷰 수행: frontend/backend build 성공, Playwright 스크린샷 스모크(`http://127.0.0.1:4173`) 확인. |
| 2026-02-14 | 운영자 UX 이슈 대응: Data Type별 조회 대상/식별자(customer key) 안내 및 Customer ID 동적 힌트 추가, 자동완성 범위 명확화. |
| 2026-02-14 | partner ID(`users._id`) 기준 `users.members` 확장 조회 기능 추가: `/api/customers/by-partner` + `/api/data/query.customerIds[]` + 프론트 Partner ID 조회 UX 반영. |
| 2026-02-14 | main 브랜치 기준 프론트 자동 배포 설정 추가: `.github/workflows/deploy-frontend-pages.yml`(GitHub Pages) + `vite` base env(`VITE_BASE_PATH`) 반영. |
| 2026-02-14 | Phase 7 착수: 인증/JWT + 사용자관리 CRUD + 슈퍼어드민 부트스트랩(다중 이메일) + 로그인 후 비밀번호 변경 + 프론트 관리자 UI 1차 구현. |
| 2026-02-14 | Phase 7 보강: 관리자 사용자 목록 인라인 편집(이메일/이름 저장) 추가, 비활성 사용자 로그인 차단 스모크(`test:smoke:auth-inactive-login`) 추가. |
| 2026-02-14 | 인증 스모크 로컬 실행 보강: `MONGODB_URI` 미설정 환경에서는 skip 처리해 로컬 오탐 방지. |
| 2026-02-15 | Phase 7 잔여 범위 조정: 감사 로그(Audit Log)는 후순위로 이관하고, 현재 진행 범위를 권한 세분화로 한정. |
| 2026-02-15 | Phase 7 권한 세분화 실행 계획 구체화: 백엔드 권한 매트릭스/API 액션 권한/프론트 노출 제어/403 UX/스모크 테스트 항목으로 분해. |

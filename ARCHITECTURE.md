# 아키텍처 참조 — 고객 로그 데이터 추출 대시보드

> Copilot 및 AI 보조 개발 시 기술 결정, 패턴, 규칙 참조용
> 최종 갱신: 2026-02-14

---

## 1. 시스템 아키텍처

```
┌──────────────────┐     HTTPS/CORS      ┌──────────────────────┐     Read-Only     ┌─────────────────┐
│  React SPA       │ ──────────────────→  │  Cloud Run Backend   │ ───────────────→  │  MongoDB Atlas  │
│  (GitHub Pages)  │ ←────────────────── │  (Node/Express/TS)   │ ←─────────────── │  (prod / logdb) │
└──────────────────┘    JSON / Stream     └──────────────────────┘    Aggregation    └─────────────────┘
                                                   │
                                          ┌────────┴────────┐
                                          │ Secret Manager   │
                                          │ (MONGODB_URI,    │
                                          │  JWT_SECRET)     │
                                          └─────────────────┘
```

---

## 2. 기술 스택

| 계층 | 기술 | 버전 | 비고 |
|------|------|------|------|
| Frontend | React + TypeScript | React 18+ | SPA, Vite 빌드 |
| UI | Tailwind CSS + shadcn/ui | Tailwind 3+ | 컴포넌트 라이브러리 |
| 상태관리 | TanStack Query (React Query) | v5 | 서버 상태 캐싱 |
| 라우팅 | React Router | v6 | SPA 라우팅 |
| Backend | Node.js + Express + TypeScript | Node 22 | CommonJS, strict |
| DB Driver | MongoDB Native Driver | 6.x | Read-Only, secondaryPreferred |
| 인증 | JWT (jsonwebtoken) | — | 이메일 기반 |
| CSV | fast-csv | — | 스트리밍 생성 |
| 검증 | Zod | — | 입력 검증, 타입 추론 |
| 배포 | Docker + Cloud Run | Node 22 Alpine | min 0, max 3 |
| CI/CD | GitHub Actions | — | main 푸시 시 자동 배포 |

---

## 3. 코딩 규칙 및 패턴

### 3.1 TypeScript 규칙
- **strict 모드** 필수 (`tsconfig.json`)
- 모든 함수 매개변수와 반환값에 명시적 타입 사용
- `any` 사용 금지 — `unknown`으로 대체 후 타입 가드
- 공유 타입은 `shared/types/`에 정의, 프론트/백 모두 참조

### 3.2 백엔드 패턴
- **라우트 → 서비스 → DB** 3계층 분리
  - routes: HTTP 요청/응답 처리만
  - services: 비즈니스 로직
  - config/database: DB 접근
- **미들웨어 체인**: `authenticate → authorize → checkDataTypeAccess → handler`
- **에러 핸들링**: 커스텀 AppError 클래스, 전역 errorHandler 미들웨어
- **환경변수**: `config/env.ts`에서 Zod로 검증 후 typed export

### 3.3 프론트엔드 패턴
- **컴포넌트**: `components/` — 재사용 가능한 UI
- **페이지**: `pages/` — 라우트 대응, 컴포넌트 조합
- **훅**: `hooks/` — API 연동, 상태 관리
- **API 클라이언트**: `lib/api.ts` — base URL, JWT 자동 첨부, 에러 인터셉터
- TanStack Query — 모든 서버 데이터는 useQuery/useMutation으로 관리

### 3.4 네이밍 컨벤션
- 파일명: camelCase (`queryBuilder.ts`, `useDataQuery.ts`)
- 컴포넌트 파일: PascalCase (`FilterPanel.tsx`, `DataTable.tsx`)
- 타입/인터페이스: PascalCase (`QueryRequest`, `UserRole`)
- 상수: UPPER_SNAKE_CASE (`MAX_EXPORT_ROWS`, `CSV_TRUNCATE_LENGTH`)
- DB 컬렉션: snake_case (`api_usage_logs`, `error_logs`)

---

## 4. API 엔드포인트 요약

| Method | Path | 설명 | 인증 | 권한 |
|--------|------|------|------|------|
| GET | `/health` | 서버 상태 | - | - |
| GET | `/api/health` | API 상태 | - | - |
| POST | `/api/auth/login` | 로그인, JWT 발급 | - | - |
| GET | `/api/me` | 내 정보 조회 | JWT | all |
| GET | `/api/schema/:dataType` | 스키마 조회 | JWT | dataType 접근 |
| GET | `/api/customers/search?q=` | 고객 검색 | JWT | all |
| POST | `/api/data/query` | 데이터 조회 | JWT | dataType 접근 |
| POST | `/api/data/export-csv` | CSV 다운로드 | JWT | dataType 접근 |
| POST | `/api/data/export-json` | JSON 다운로드 | JWT | dataType 접근 |
| GET | `/api/presets` | 프리셋 목록 | JWT | all |
| POST | `/api/presets` | 프리셋 저장 | JWT | all |
| PUT | `/api/presets/:id` | 프리셋 수정 | JWT | owner |
| DELETE | `/api/presets/:id` | 프리셋 삭제 | JWT | owner |
| GET | `/api/admin/users` | 사용자 목록 | JWT | admin |
| POST | `/api/admin/users` | 사용자 생성 | JWT | admin |
| PUT | `/api/admin/users/:id` | 사용자 수정 | JWT | admin |
| DELETE | `/api/admin/users/:id` | 사용자 비활성화 | JWT | admin |

---

## 5. 데이터 모델

### 5.1 User (ops_tool DB)
```json
{
  "_id": "ObjectId",
  "email": "string (unique, 사용자 식별자)",
  "name": "string (optional)",
  "passwordHash": "string (bcrypt)",
  "role": "admin | operator | viewer",
  "allowedMenus": ["dashboard", "json-export", "admin-users"],
  "allowedDataTypes": ["conversations", "api_usage_logs", "event_logs", "error_logs", "billing_logs", "user_activities"],
  "status": "active | inactive",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### 5.2 Preset (ops_tool DB)
```json
{
  "_id": "ObjectId",
  "userId": "ObjectId (owner)",
  "name": "string",
  "dataType": "string",
  "filters": { "customerId": "...", "dateRange": {"start": "...", "end": "..."}, "method": "POST" },
  "columns": ["col1", "col2"],
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### 5.3 AuditLog (ops_tool DB)
```json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "email": "string",
  "action": "query | export-csv | export-json",
  "dataType": "string",
  "filters": { "..." },
  "resultCount": "number",
  "timestamp": "Date"
}
```

---

## 6. 쿼리 빌더 변환 규칙

### 입력 (FilterCondition JSON)
```json
{
  "dataType": "api_usage_logs",
  "customerId": "cust_123",
  "dateRange": { "start": "2024-01-01", "end": "2024-01-31" },
  "filters": { "method": "POST", "statusCode": "500" },
  "columns": ["timestamp", "endpoint", "method", "statusCode"],
  "pageSize": 100,
  "cursor": { "afterTs": "2024-01-15T00:00:00Z", "afterId": "abc123" }
}
```

### 출력 (MongoDB Aggregation Pipeline)
```json
[
  {
    "$match": {
      "userId": "cust_123",
      "timestamp": { "$gte": "2024-01-01T00:00:00Z", "$lte": "2024-01-31T23:59:59Z" },
      "method": "POST",
      "statusCode": 500
    }
  },
  { "$sort": { "timestamp": -1, "_id": -1 } },
  {
    "$project": {
      "timestamp": 1, "endpoint": 1, "method": 1, "statusCode": 1, "_id": 1
    }
  },
  { "$limit": 101 }
]
```

### 필터 타입별 변환
| 필터 type | MongoDB 연산 | 예시 |
|-----------|-------------|------|
| `select` | `$eq` | `"method": "POST"` |
| `search` | `$regex` (case-insensitive) | `"endpoint": { "$regex": "user", "$options": "i" }` |
| `range` | `$gte` / `$lte` | `"tokenUsage": { "$gte": 100, "$lte": 500 }` |

### 가드레일
- `customerId` + `dateRange` 필수 (없으면 400 에러)
- 결과 제한: 조회 100행, Export 10,000행
- 쿼리 타임아웃: 30초 (`maxTimeMS`)
- `readPreference: secondaryPreferred`
- seek pagination: `timestamp + _id` 복합 조건

---

## 7. CSV Truncate 정책

- 기본 truncate 길이: **5,000자**
- 적용 대상: 문자열(string) 타입 필드만
- 잘린 경우 `...[TRUNCATED]` 접미사 추가
- 환경변수 `CSV_TRUNCATE_LENGTH`로 조정 가능
- JSON Export에는 Truncate 미적용 (원문 그대로)

---

## 8. 보안 체크리스트

- [ ] MongoDB Read-Only 계정만 사용 (NF-01)
- [ ] 쿼리 빌더: find/aggregate만 허용 (NF-02)
- [ ] JWT 기반 인증, RBAC + 메뉴 권한 (NF-03)
- [ ] 모든 조회/다운로드 감사 로그 (NF-04)
- [ ] 1회 최대 10,000건 제한 (NF-05)
- [ ] 입력값 Zod 검증 + $ 키 차단 (NF-07)
- [ ] CORS: GitHub Pages 도메인만 허용
- [ ] 환경변수로 비밀정보 분리 (.env → Secret Manager)

---

## 9. Cloud Run 배포 설정

| 설정 | 값 | 비고 |
|------|-----|------|
| Region | asia-northeast3 | 서울 |
| Min instances | 0 | scale to zero |
| Max instances | 3 | DB 부하 상한 |
| Concurrency | 30 | 스트리밍 다운로드 고려 |
| Timeout | 300s | Export 작업 대비 |
| Memory | 512Mi | 필요 시 1Gi |
| CPU | 요청 중만 할당 | 비용 절감 |
| Image | asia-northeast3-docker.pkg.dev/veluga-ops-tool/veluga-backend/log-csv-api | Artifact Registry |

---

## 10. 환경변수 목록

| 변수명 | 설명 | 기본값 | 필수 |
|--------|------|--------|------|
| `PORT` | 서버 포트 | 8080 | O |
| `MONGODB_URI` | MongoDB Atlas 연결 문자열 | - | O |
| `MONGODB_DB_NAME` | 대상 데이터베이스명 | logdb | O |
| `OPS_TOOL_DB_NAME` | 운영 도구 DB (User/Preset/AuditLog) | ops_tool | O |
| `JWT_SECRET` | JWT 서명 키 | - | O |
| `JWT_EXPIRES_IN` | JWT 만료 시간 | 8h | X |
| `CORS_ORIGIN` | 허용 Origin | * | O (prod) |
| `MAX_EXPORT_ROWS` | Export 최대 행수 | 10000 | X |
| `CSV_TRUNCATE_LENGTH` | CSV 문자열 Truncate 길이 | 5000 | X |
| `MAX_CONCURRENT_EXPORTS` | 동시 Export 제한 | 2 | X |
| `QUERY_TIMEOUT_MS` | 쿼리 타임아웃 (ms) | 30000 | X |

---

## 11. 참조

- `PRD_v1_2_1_CloudRun.md` — 전체 요구사항
- `DEVELOPMENT_PLAN.md` — 단계별 개발 계획
- `PROJECT_STATUS.md` — 진행 상황 추적

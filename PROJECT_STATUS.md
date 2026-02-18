# 프로젝트 진행 현황 — User Log Dashboard

> 최종 갱신: 2026-02-18
> 목적: 현재 상태를 빠르게 파악하는 운영용 요약 문서 (상세 설계/요구사항은 별도 문서 참조)

---

## 1) 전체 스냅샷

| 영역 | 상태 | 비고 |
|---|---|---|
| 백엔드 API | 🟢 안정화 단계 | 조회/요약/고객검색/인증/관리자 사용자 관리 동작 |
| 프론트 대시보드 | 🟢 운영 가능 | 사용자 로그 + 서비스 로그 + 관리자 페이지 |
| 서비스 로그(Q/A 매핑) | 🟢 1차 완료 | 고객 보고 모드/세션 매핑/요약 지표 반영 |
| 파트너 로그(기관 단위) | 🟢 MVP 완료 | 전용 페이지/권한 가드/파트너 전용 다운로드 API 반영 |
| 배포 파이프라인 | 🟢 운영 중 | Cloud Run 배포 스크립트 + GitHub Actions |
| Export(서버 스트리밍) | 🟢 확장 완료 | 기본 export + 파트너 전용 export(csv/json/gzip) 제공 |
| 프리셋/히스토리 고도화 | 🟡 후속 과제 | 기본 실행 이력만 제공 |

---

## 2) 최근 완료 (2026-02-18)

- 파트너 로그 메뉴/페이지 MVP 구현 완료
  - 프론트: `/partner-logs` 페이지 신설 (`frontend/src/pages/PartnerLogPage.tsx`)
  - 사이드바 메뉴 노출 + 권한 없는 사용자 비노출
  - 라우트 가드: 메뉴 권한 + 데이터 권한(conversations) 동시 검사
  - 실행 메타 표시 + 실패 청크 요약 표시
  - CSV/JSON 다운로드 + JSON gzip 옵션 제공

- 파트너 전용 Export API 추가(서버 스트리밍)
  - `POST /api/data/query-partner/conversations/export-csv`
  - `POST /api/data/query-partner/conversations/export-json` (`?gzip=1` 지원)
  - 프론트 다운로드를 클라이언트 생성 방식에서 서버 export API 기반으로 전환

- 파트너 저부하 가드레일 보강
  - 월 경계 중복 조회 제거(윈도우 end 보정)
  - 실패 청크 `attempts`를 실제 재시도 횟수로 기록
  - 실행 메타에 `pauseMs`, `maxRetries` 포함

- 비IT 사용자 사용성 점검(1차) 완료
  - 결론: 고객 검색 + 기본 필터 + 조회/다운로드 흐름으로 실무 사용 가능
  - 보완 반영: `billing_logs` 기본 필터/기본 컬럼 자동 적용
  - 오해 방지: 결제 금액은 "요금제 기준 금액(plans.price)"이며 실결제/환불 미지원 문구 표기

- 결제 로그 메뉴 기획 문서화(정산 관점)
  - 실데이터 재실사 반영: `userplans/userplanhistories/plans/businessplans/usagelogs/logentrydbs(category=Billing)`
  - 결제 로그 MVP 컬럼/필터/집계/예외 규칙 정의
  - 정산 리스크 명시: usage 타입 혼재, 플랜 조인 미매칭, invoice/refund 구조 컬렉션 부재

- 파트너 로그(기관 단위) 계획 수립/문서 반영
  - 운영 요청 시나리오 기준: 기관 전체 대화 로그 요청 대응
  - 2트랙 확정: 단기(DB 오프라인 추출) + 중기(API 표준 워크플로우)
  - 메뉴 신설 확정: `/partner-logs` (권한 기반 노출)
  - 내부 보고 확장 컬럼(누가/언제/신뢰도) 및 저부하 가드레일 원칙 반영
- 내부 보고 확장 컬럼(1차) 구현 완료
  - `questionCreatorType`, `questionCreatorRaw`
  - `answerAt`, `responseLatencyMs`
  - `modelConfidence`, `likeConfidence`
  - 서비스 로그 기본 컬럼 순서 반영 + 스모크 테스트 검증 항목 추가
- 파트너 Track 1 오프라인 추출 스크립트 구현 완료
  - 실행: `npm run export:partner:conversations -- --partnerId <ID> --start <ISO> --end <ISO>`
  - 기능: 월 단위 윈도우 분할, 고객/채널 청크, 재시도, NDJSON + summary 파일 출력
- 파트너 Track 2 API 표준 워크플로우 구현 완료
  - 엔드포인트: `POST /api/data/query-partner/conversations`
  - 요청 표준: `partnerId`, `dateRange`, `chunkOptions`
  - 응답 메타: `processedChunks`, `failedChunks`, `elapsedMs`, `executionPlan(월 단위 윈도우)`

- 서비스 로그 전용 메뉴/페이지 추가 (`/service-logs`)
- `conversations` 고객 보고 모드 요청값 반영
  - `includeSessionMessages=true`
  - `reportMode="customer"`
  - `matchWindowSec=60`
- 백엔드 세션 매핑 서비스 추가
  - 질문/최종답변/모델/크레딧/매핑출처(`matchSource`) 구성
  - `summary.unmatchedCount`, `summary.fallbackCount`, `summary.totalCreditUsed` 제공
- 서비스 로그 결과 컬럼 순서 고정(고객 보고용)
- 서비스 로그 결과 컬럼 조정
  - `matchScore` 제외
  - `like`(좋아요/나빠요) 표시 반영 (DB 기존 값 읽기)
- 정렬 토글 UI 반영 (사용자 로그/서비스 로그 공통)
  - 오름차순 / 최신순
  - 로컬 저장소(`query settings`)에 정렬 상태 저장/복원
- 필터 패널 채널 조회/선택 개선
  - 채널 선택 라벨: `channel_id (channel_name)` 표시
  - 채널 메타 조회 API: `GET /api/customers/channels?dataType=&customerId=`
- Export 스트리밍 API 추가
  - `POST /api/data/export-csv`
  - `POST /api/data/export-json`
  - 프로덕션 DB Read-Only 원칙 유지 (쓰기/스키마 변경 없음)
- 백엔드 전역 에러 핸들링 추가
  - `backend/src/middleware/errorHandler.ts`
  - 구조화된 에러 응답 포맷 적용: `{ error: { code, message, details? } }`
  - `notFoundHandler` + `errorHandler` 전역 등록
- 프론트 공통 UI 컴포넌트 분리
  - `frontend/src/components/ui/` (`Button`, `Input`, `Skeleton`, `Table`)
  - `LogDashboard`에 공통 컴포넌트 적용 (테이블/버튼/입력 필드)
- 쿼리 가드레일 운영 적용 확인
  - 쿼리 타임아웃: `QUERY_TIMEOUT_MS` (기본 30초)
  - 조회 readPreference: `secondaryPreferred`

---

## 3) 현재 기능 범위 (운영 기준)

### 백엔드
- Health: `GET /health`, `GET /api/health`
- Schema: `GET /api/schema/:dataType`
- Query: `POST /api/data/query`
- Batch(대화): `POST /api/data/query-batch/conversations`
- Partner Workflow: `POST /api/data/query-partner/conversations`
- Export: `POST /api/data/export-csv`, `POST /api/data/export-json`
- Partner Export: `POST /api/data/query-partner/conversations/export-csv`, `POST /api/data/query-partner/conversations/export-json?gzip=1`
- Summary: `POST /api/data/summary/period`, `POST /api/data/summary/by-data-type`
- Customer Search: `GET /api/customers/search?q=`
- Customer Channels: `GET /api/customers/channels?dataType=&customerId=`
- Auth/Admin: 로그인/내정보/관리자 사용자 CRUD

### 프론트
- 로그인, 권한 기반 라우팅/사이드바
- 사용자 로그 대시보드 (`/`)
- 서비스 로그 대시보드 (`/service-logs`)
- 파트너 로그 대시보드 (`/partner-logs`) — MVP 운영 가능
- 관리자 사용자 관리 (`/admin/users`)
- 필터/스키마 기반 조회, 컬럼 선택, CSV/JSON 다운로드

---

## 4) 다음 우선순위 (Short Backlog)

1. 감사로그 게이트 적용(권한 보유 운영자 + 추출 이력 필수)
2. 파트너 추출 라우트 인증/인가 강제
3. 프리셋 CRUD + 재실행 UX
4. 조회 히스토리 고도화(필터/결과 메타 재사용)
5. 성능 가드레일 보강(대용량 기간/채널 조합)
6. 운영 문서 자동화(릴리스 노트/변경 로그 연동)

---

## 5) 리스크 / 점검 포인트

- MongoDB 대용량 조회 시 기간/채널 조합에 따른 응답시간 편차
- 서비스 로그 매핑에서 데이터 품질(누락/지연)에 따른 `unmatched` 비율 관리 필요
- 파트너 기관 대량 추출 시 멤버 범위 정확도(`users.members` 기반) 검증 필요
- 파트너 추출 경로에 인증/인가 + 감사로그 강제 적용 필요
- 문서와 실제 구현 간 괴리 방지를 위해 배포 단위 갱신 원칙 유지 필요

---

## 6) 문서 운영 원칙

- 이 문서는 **요약본만 유지** (목표: 빠른 의사결정)
- 세부 구현 계획: `DEVELOPMENT_PLAN.md`
- 요구사항 원문: `PRD_v1_2_1_CloudRun.md`
- 구조/패턴: `ARCHITECTURE.md`
- 실행/운영 가이드: `README.md`

---

## 7) 참고

- 최신 코드 기준 빌드 검증: `backend npm run build`, `frontend npm run build` 통과 (2026-02-18)
- 최신 변경 핵심: 파트너 로그 MVP + 파트너 전용 export(csv/json/gzip) + 저부하 가드레일 보강

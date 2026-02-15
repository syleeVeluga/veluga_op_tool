# 프로젝트 진행 현황 — User Log Dashboard

> 최종 갱신: 2026-02-15
> 목적: 현재 상태를 빠르게 파악하는 운영용 요약 문서 (상세 설계/요구사항은 별도 문서 참조)

---

## 1) 전체 스냅샷

| 영역 | 상태 | 비고 |
|---|---|---|
| 백엔드 API | 🟢 안정화 단계 | 조회/요약/고객검색/인증/관리자 사용자 관리 동작 |
| 프론트 대시보드 | 🟢 운영 가능 | 사용자 로그 + 서비스 로그 + 관리자 페이지 |
| 서비스 로그(Q/A 매핑) | 🟢 1차 완료 | 고객 보고 모드/세션 매핑/요약 지표 반영 |
| 배포 파이프라인 | 🟢 운영 중 | Cloud Run 배포 스크립트 + GitHub Actions |
| Export(서버 스트리밍) | 🟢 1차 완료 | `/api/data/export-csv`, `/api/data/export-json` 제공 |
| 프리셋/히스토리 고도화 | 🟡 후속 과제 | 기본 실행 이력만 제공 |

---

## 2) 최근 완료 (2026-02-15)

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
- Export: `POST /api/data/export-csv`, `POST /api/data/export-json`
- Summary: `POST /api/data/summary/period`, `POST /api/data/summary/by-data-type`
- Customer Search: `GET /api/customers/search?q=`
- Customer Channels: `GET /api/customers/channels?dataType=&customerId=`
- Auth/Admin: 로그인/내정보/관리자 사용자 CRUD

### 프론트
- 로그인, 권한 기반 라우팅/사이드바
- 사용자 로그 대시보드 (`/`)
- 서비스 로그 대시보드 (`/service-logs`)
- 관리자 사용자 관리 (`/admin/users`)
- 필터/스키마 기반 조회, 컬럼 선택, CSV/JSON 다운로드

---

## 4) 다음 우선순위 (Short Backlog)

1. 프리셋 CRUD + 재실행 UX
2. 조회 히스토리 고도화(필터/결과 메타 재사용)
3. 성능 가드레일 보강(대용량 기간/채널 조합)
4. 운영 문서 자동화(릴리스 노트/변경 로그 연동)

---

## 5) 리스크 / 점검 포인트

- MongoDB 대용량 조회 시 기간/채널 조합에 따른 응답시간 편차
- 서비스 로그 매핑에서 데이터 품질(누락/지연)에 따른 `unmatched` 비율 관리 필요
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

- 최신 코드 기준 빌드 검증(프론트): `npm run build` 통과 (2026-02-15)
- 최신 변경 핵심: 로그 화면 기본 정렬 토글(오름차순/최신순) 공통 적용

# 프로젝트 진행 현황 — User Log Dashboard

> 최종 갱신: 2026-02-18 (Phase 8-1)
> 목적: 현재 상태를 빠르게 파악하는 운영용 요약 문서 (상세 설계/요구사항은 별도 문서 참조)

---

## 1) 전체 스냅샷

| 영역 | 상태 | 비고 |
|---|---|---|
| 백엔드 API | 🟢 안정화 단계 | 조회/요약/고객검색/인증/관리자 사용자 관리 동작 |
| 프론트 대시보드 | 🟢 운영 가능 | 사용자 로그 + 서비스 로그 + 파트너 로그 + 관리자 페이지(7-1 완료) |
| 서비스 로그(Q/A 매핑) | 🟢 1차 완료 | 고객 보고 모드/세션 매핑/요약 지표 반영 |
| 파트너 로그(기관 단위) | 🟢 MVP 완료 | 전용 페이지/권한 가드/파트너 전용 다운로드 API 반영 |
| 배포 파이프라인 | 🟢 운영 중 | Cloud Run 배포 스크립트 + GitHub Actions |
| Export(서버 스트리밍) | 🟢 확장 완료 | 기본 export + 파트너 전용 export(csv/json/gzip) 제공 |
| 프리셋/히스토리 고도화 | 🟡 후속 과제 | 기본 실행 이력만 제공 |

---

## 2) 최근 완료 (2026-02-18, Phase 8-1)

- TypeScript 컴파일 검사 통과 (백엔드 + 프론트엔드)
- Smoke 테스트 10종 중 8종 통과 (1종 로컬 DNS 실패, 1종 `SMOKE_PARTNER_ID` 미설정 스킵)
- 관리자 페이지 모달 기반 UX 재작성 (`allowedMenus`/`allowedDataTypes` 체크박스 UI)
- 파트너 로그 페이지 MVP (`/partner-logs`), 파트너 전용 Export API 추가
- 서비스 로그 내부 보고 확장 컬럼(`questionCreatorType`, `answerAt`, `responseLatencyMs` 등)

커밋: `a0ca77e`

---

## 3) 현재 기능 범위 (운영 기준)

### 백엔드
- Health: `GET /health`, `GET /api/health`
- Schema: `GET /api/schema/:dataType`
- Query: `POST /api/data/query`
- Batch(대화): `POST /api/data/query-batch/conversations`
- Export: `POST /api/data/export-csv`, `POST /api/data/export-json`
- Batch Export: `POST /api/data/query-batch/conversations/export-csv`, `POST /api/data/query-batch/conversations/export-json?gzip=1`
- Summary: `POST /api/data/summary/period`, `POST /api/data/summary/by-data-type`
- Customer Search: `GET /api/customers/search?q=`
- Customer Channels: `GET /api/customers/channels?dataType=&customerId=`
- Auth/Admin: 로그인/내정보/관리자 사용자 CRUD

### 프론트
- 로그인, 권한 기반 라우팅/사이드바
- 사용자 로그 대시보드 (`/`)
- 서비스 로그 대시보드 (`/service-logs`)
- 파트너 로그 대시보드 (`/partner-logs`) — MVP 운영 가능
- 관리자 사용자 관리 (`/admin`) — 모달 기반 CRUD, 메뉴/데이터 권한 UI(7-1)
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


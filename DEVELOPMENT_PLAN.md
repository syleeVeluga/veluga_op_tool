# 개발 계획서 — 미완료 백로그

> 완료 항목은 `PROJECT_STATUS.md`, 요구사항 원문은 `PRD_v1_2_1_CloudRun.md` 참조.
> 최종 갱신: 2026-02-18

---

## 미완료 항목

### 인프라
- [ ] `shared/types/` 공유 타입 폴더 (`filter.ts`, `query.ts`, `schema.ts`, `user.ts`, `preset.ts`, `export.ts`)

### 백엔드
- [ ] 프리셋 API (`/api/presets`) — GET(목록), POST(저장), PUT(수정), DELETE, 사용자별 격리
- [ ] 감사 로그 (`backend/src/middleware/auditLogger.ts`)
  - 조회/다운로드마다 기록: `{ userId, email, action, dataType, filters, resultCount, timestamp }`
  - 파트너 추출 확장 필드: `{ actorUserId, partnerId, memberCount, dateRange, processedChunks, failedChunks, elapsedMs, status }`
  - 파트너 추출 라우트에 인증/인가 + 감사로그 **강제 적용** (보안 필수)
- [ ] 단위 테스트: queryBuilder, csvGenerator, jsonExporter

### 프론트엔드
- [ ] 프리셋 매니저 UI (`PresetManager.tsx`) — 저장/목록/재실행/삭제
- [ ] 조회 히스토리 (`QueryHistory.tsx`) — 최근 20건, 재실행
- [ ] 메뉴 접근 제어 완전 통합 (Phase 7-2)
  - `allowedMenus` 기반 Sidebar 필터링 (현재 UI만 구현, 백엔드 연동 미완)
  - ProtectedRoute 메뉴 + 데이터 유형 동시 검사
  - 직접 URL 접근 차단 → 403 안내 페이지

### QA / 성능
- [ ] UC-01~UC-06 시나리오 수동 검증
- [ ] 보안 테스트: NoSQL Injection, 권한 우회
- [ ] 성능 기준 검증: 조회 < 3s(1000건), CSV < 5s(10000건), 동시 10명
- [ ] 파트너 대량 추출 부하 검증 + 기관 규모별 완료 시간 산정

### 배포
- [ ] Cloud Run CORS 설정 확정 (GitHub Pages 도메인만 허용, 현재 `*`)
- [ ] Secret Manager 연동 (MONGODB_URI, JWT_SECRET)

---

## 핵심 결정사항

| 항목 | 결정 | 근거 |
|------|------|------|
| DB 드라이버 | MongoDB Native Driver | Read-Only 조회 전용, Mongoose보다 가벼움 |
| 인증 | 이메일 + 비밀번호 + JWT | PRD 요구사항, SSO는 추후 교체 가능 |
| 개발 순서 | Backend-first | API 준비 후 Frontend 개발이 효율적 |
| CSV 라이브러리 | fast-csv | 스트리밍 지원, 대용량 처리 |
| 입력 검증 | Zod | TypeScript 타입 추론, 간결한 문법 |
| 페이지네이션 | Seek (cursor) 방식 | offset 대비 대용량 성능 우수 |
| Export | 클라이언트 사이드 | 서버 스트리밍 엔드포인트 존재하나 UI 미사용 (파트너 Export만 서버 API 사용) |

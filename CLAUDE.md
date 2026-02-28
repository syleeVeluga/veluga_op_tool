# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Veluga User Log Dashboard — a full-stack web app enabling non-technical ops/CS staff to query, filter, and export customer log data from MongoDB Atlas without direct database access. UI labels are in Korean; code is in English.

## Project-Specific Guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

**Tech stack**: React 19 + Vite + TypeScript (frontend) / Node.js 22 + Express + TypeScript (backend) / MongoDB Atlas (read-only) / Docker + Google Cloud Run (deploy) / GitHub Pages (frontend hosting)

## Development Commands

### Backend (`cd backend`)

```bash
npm run dev              # tsx watch (hot reload, port 8080)
npm run build            # tsc → dist/
npm run start            # node dist/index.js
npm run test:smoke:schema              # smoke test: schema endpoint
npm run test:smoke:query-builder       # smoke test: query aggregation
npm run test:smoke:data-query          # smoke test: POST /api/data/query
npm run test:smoke:customer-search     # smoke test: customer search
npm run test:smoke:auth-inactive-login # smoke test: auth flow
# (10 smoke test scripts total — see package.json for full list)
npm run profile:mongo:readonly         # non-intrusive MongoDB schema scan
```

### Frontend (`cd frontend`)

```bash
npm run dev       # Vite dev server (port 5173)
npm run build     # tsc -b && vite build → dist/
npm run lint      # ESLint (flat config v9)
npm run preview   # preview production build
```

### Health checks (backend running)

```text
GET /health          — MongoDB connection status
GET /api/health      — Service status
```

## Architecture

### Monorepo Layout

- `backend/` — Node.js Express API (CommonJS, strict TypeScript)
- `frontend/` — React SPA (ESM, strict TypeScript, Tailwind CSS)
- `scripts/` — PowerShell deployment scripts (Cloud Run)
- `.github/workflows/` — CI/CD (auto-deploy on push to `main`)

### Backend: 3-Layer Pattern

**Routes → Services → Database**

- `src/app.ts` — Express app factory, mounts routers at `/api/auth`, `/api/admin`, `/api`
- `src/routes/` — `auth.ts` (login/JWT), `data.ts` (query/export/schema), `adminUsers.ts` (user CRUD)
- `src/services/` — Business logic: `queryBuilder.ts` (MongoDB aggregation pipeline), `authService.ts`, `exportStreaming.ts` (CSV/JSON streaming), `customerSearch.ts`, `periodSummary.ts`, `batchConversationWorkflow.ts` (대량 대화 조회), `conversationBatchQuery.ts`, `conversationCustomerReport.ts`, `customerChannels.ts`, `dataTypeSummary.ts`, `schemaProvider.ts`, `userService.ts`
- `src/config/schema/` — Data type definitions (columns, filters, db/collection mapping). Registry in `index.ts`
- `src/config/env.ts` — Zod-validated environment config
- `src/config/database.ts` — MongoDB connection pool (secondaryPreferred reads)
- `src/config/dns.ts` — DNS resolution config
- `src/middleware/` — `authz.ts` (JWT + RBAC), `validators.ts` (Zod), `errorHandler.ts`

### Frontend: React + Context

- `src/App.tsx` — BrowserRouter with auth guard; unauthenticated → LoginPage
- `src/contexts/AuthContext.tsx` — JWT + user session via localStorage
- `src/layouts/DashboardLayout.tsx` — Sidebar + Outlet with menu permission guards
- `src/pages/` — `UserLogPage` (main dashboard), `ServiceLogPage`, `PartnerLogPage`, `AdminPage`, `LoginPage`
- `src/components/LogDashboard.tsx` — Reusable filter panel + data table
- `src/components/Sidebar.tsx` — Sidebar navigation with menu permission guards
- `src/components/ui/` — Shared primitives (Button, Input, Modal, Table, Skeleton, Checkbox)
- `src/lib/api.ts` — Fetch wrapper (auto-appends `/api` if needed, Bearer token injection)
- `src/lib/storage.ts` — localStorage wrapper, `src/lib/utils.ts` — general utilities
- `src/constants.ts` — Data type definitions, menu configurations

### Data Types (6 total)

Defined in `backend/src/config/schema/`: `conversations`, `billing_logs`, `api_usage_logs`, `error_logs`, `event_logs`, `user_activities`. Each schema specifies: dataType, dbName, collectionName, customerIdField, columns[], filters[].

### Auth & RBAC

- JWT (HS256, 8h expiry) with bcrypt passwords
- Roles: `super_admin` > `admin` > `user`
- Per-user permissions: `allowedMenus` (sidebar visibility) and `allowedDataTypes` (query access)

### Query Pipeline

1. Frontend submits filters → `POST /api/data/query`
2. `queryBuilder.ts` builds MongoDB aggregation: $match → $sort → $project → $limit
3. Cursor-based pagination via `{ afterTs, afterId }` tuple
4. Guards: mandatory customerId + dateRange, 100-row query limit, 10K-row export limit, 30s timeout

### Export

- CSV: streaming with BOM, 5K-char truncation, concurrent semaphore (max 2)
- JSON: full data, optional gzip (`?gzip=1`)

## Key Patterns

- **Zod everywhere**: Input validation (backend middleware + env config), runtime type safety
- **Structured errors**: All API errors return `{ error: { code, message, details? } }`
- **Degraded mode**: Backend starts without MongoDB in dev (for frontend-only work)
- **Schema registry**: Adding a new data type = new file in `backend/src/config/schema/` + register in `index.ts` + update `frontend/src/constants.ts`
- **Read-only DB access**: No writes to production MongoDB; ops_tool DB stores users/config

## Deployment

- **Backend**: Docker multi-stage (Node 22-Alpine) → Artifact Registry → Cloud Run (asia-northeast3)
- **Frontend**: Vite build → GitHub Pages (base path auto-computed from repo type)
- **CI/CD**: GitHub Actions on `main` push — `backend/**` triggers Cloud Run deploy, `frontend/**` triggers Pages deploy
- **Manual deploy**: `.\scripts\deploy-cloudrun.ps1` (PowerShell, supports canary + auto-rollback)

## Environment Variables

Backend (see `backend/.env.example`): `PORT`, `MONGODB_URI`, `MONGODB_DB_NAME`, `OPS_TOOL_DB_NAME`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `SUPER_ADMIN_EMAILS`, `MAX_EXPORT_ROWS`, `CSV_TRUNCATE_LENGTH`, `QUERY_TIMEOUT_MS`

Frontend: `VITE_API_BASE_URL` (backend URL), `VITE_BASE_PATH` (GitHub Pages base)

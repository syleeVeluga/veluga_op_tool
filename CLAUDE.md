# CLAUDE.md

Veluga User Log Dashboard — ops/CS staff query and export customer logs from MongoDB Atlas. UI labels in Korean; code in English.

## Development Commands

### Backend (`cd backend`)

```bash
npm run dev              # tsx watch, port 8080
npm run build            # tsc → dist/
npm run start            # node dist/index.js
# 10 smoke tests total — see package.json for full list
npm run test:smoke:schema
npm run test:smoke:data-query
npm run profile:mongo:readonly  # non-intrusive MongoDB schema scan
```

### Frontend (`cd frontend`)

```bash
npm run dev     # Vite dev server, port 5173
npm run build   # tsc -b && vite build → dist/
npm run lint    # ESLint flat config v9
```

## Architecture

**Stack**: React 19 + Vite + TypeScript / Node.js 22 + Express + TypeScript / MongoDB Atlas (read-only) / Docker + Cloud Run / GitHub Pages

**Backend**: Routes → Services → Database (3-layer)

**Non-obvious decisions:**
- Adding a data type requires 3 changes: new schema file in `backend/src/config/schema/` + register in `index.ts` + update `frontend/src/constants.ts`
- Export is **client-side only** — frontend builds CSV/JSON from fetched query results; backend streaming endpoints (`exportStreaming.ts`) exist but the UI does not use them
- Query guards: mandatory `customerId` + `dateRange`, 100-row query limit, 10K-row export limit, 30s timeout
- Auth: JWT HS256 (8h), roles `super_admin` > `admin` > `user`, per-user `allowedMenus` + `allowedDataTypes`
- Billing feature queries OpenAI/Anthropic Admin APIs for usage & cost data — no MongoDB involved; requires `OPENAI_ADMIN_API_KEY` and/or `ANTHROPIC_ADMIN_API_KEY` env vars; monthly aggregation is done server-side from daily buckets
- Backend starts in degraded mode (no MongoDB) for frontend-only dev

## Key Patterns

- Structured errors: `{ error: { code, message, details? } }`
- No writes to production MongoDB; ops_tool DB stores users/config only
- Cursor-based pagination via `{ afterTs, afterId }` tuple

## Deployment

- **CI/CD**: `backend/**` push → Cloud Run deploy; `frontend/**` push → GitHub Pages
- **Manual**: `.\scripts\deploy-cloudrun.ps1` (supports canary + auto-rollback)

## Environment Variables

Backend (`backend/.env.example`): `PORT`, `MONGODB_URI`, `MONGODB_DB_NAME`, `OPS_TOOL_DB_NAME`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `SUPER_ADMIN_EMAILS`, `MAX_EXPORT_ROWS`, `CSV_TRUNCATE_LENGTH`, `QUERY_TIMEOUT_MS`, `OPENAI_ADMIN_API_KEY`, `ANTHROPIC_ADMIN_API_KEY`

Frontend: `VITE_API_BASE_URL` (backend URL), `VITE_BASE_PATH` (GitHub Pages base)

## Coding Guidelines

- Minimum code for the task — no speculative features, no premature abstractions
- Touch only what's needed — don't improve adjacent code, match existing style
- Ask before implementing if intent is unclear

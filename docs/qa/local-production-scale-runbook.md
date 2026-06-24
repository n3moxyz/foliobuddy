# Local Production-Scale QA Runbook

Use this for production-like local testing with sanitized data. Do not use production databases,
real user exports, or `npm run db:sync` for this workflow.

## Preconditions

- Docker Desktop is running.
- `packages/backend/.env` points to a local database on `localhost:5433`.
- `packages/backend/.env` uses local-safe settings:

```env
NODE_ENV=development
DATABASE_URL=postgresql://dev:dev@localhost:5433/example_portfolio_db
ALLOWED_ORIGINS=http://localhost:4000
RATE_LIMIT_MAX=10000
ALLOW_LOCAL_AUTH_BYPASS=true
LOCAL_AUTH_USER_ID=local-scale-user
```

`ALLOW_LOCAL_AUTH_BYPASS` is ignored in `NODE_ENV=production`; it exists only so the local
frontend can exercise real authenticated API routes without Clerk credentials.
`ALLOWED_ORIGINS` must include the Vite port in use; otherwise the backend can be healthy while the
browser shows empty pages from CORS-blocked API calls.

The frontend must also run with:

```env
VITE_API_URL=http://localhost:4001/api/v1
VITE_LOCAL_AUTH_BYPASS=true
```

`VITE_LOCAL_AUTH_BYPASS` only works in Vite dev mode; production builds keep the Clerk gate.
In local bypass mode the frontend skips ClerkProvider, uses a no-token API getter, shows an `LB`
avatar, and leaves websocket status disconnected. Test real websocket reconnect behavior with a
Clerk-authenticated local session, or use the explicit harness in
`socketService.integration.test.ts` and `useWebSocket.test.ts` when credentials are unavailable.

If Docker reports `example_portfolio_db` does not exist, the existing local volume may have been
initialized before the current Compose default. List local DB names without touching data:

```bash
docker exec pa-local-db psql -U dev -d postgres -tAc "select datname from pg_database where datistemplate = false order by datname;"
```

Use the listed local database in `DATABASE_URL`, or ask before recreating the Docker volume.

## Build The Sanitized Scale Dataset

```bash
npm run db:local
npm run db:deploy --workspace=@foliobuddy/backend
npm run db:seed:scale
```

Expected seed shape:

- 60+ synthetic assets across crypto, stablecoins, cash, equities, unit trusts, angel, and NFTs.
- 60+ positions, including custody rows and repeated assets/storage locations.
- 240 trades with open/closed, long/short, win/loss, and tag coverage.
- 390 daily snapshots plus monthly snapshot-position detail rows.
- 5 investors, including an owner and a zero-stake observer.

The scale seed uses deterministic `scale-*` IDs and upserts. It updates only synthetic scale rows
for `LOCAL_AUTH_USER_ID`; it does not delete unknown local rows.

## Run The Local Stack

```bash
DATABASE_URL=postgresql://dev:dev@localhost:5433/example_portfolio_db ALLOWED_ORIGINS=http://localhost:4000 ALLOW_LOCAL_AUTH_BYPASS=true LOCAL_AUTH_USER_ID=local-scale-user npm run dev --workspace=@foliobuddy/backend
VITE_API_URL=http://localhost:4001/api/v1 VITE_LOCAL_AUTH_BYPASS=true npm run dev --workspace=@foliobuddy/frontend
```

PowerShell equivalent:

```powershell
$env:ALLOW_LOCAL_AUTH_BYPASS = 'true'
$env:LOCAL_AUTH_USER_ID = 'local-scale-user'
$env:DATABASE_URL = 'postgresql://dev:dev@localhost:5433/example_portfolio_db'
$env:ALLOWED_ORIGINS = 'http://localhost:4000'
npm run dev --workspace=@foliobuddy/backend

$env:VITE_API_URL = 'http://localhost:4001/api/v1'
$env:VITE_LOCAL_AUTH_BYPASS = 'true'
npm run dev --workspace=@foliobuddy/frontend
```

Open `http://localhost:4000` with `VITE_API_URL=http://localhost:4001/api/v1` if the frontend is
not proxying to the backend.

## QA Inventory Pass

Use `docs/qa/user-facing-inventory.md` as the source-backed checklist. It inventories the roles,
routes, controls, dialogs, inputs, states, workflows, API evidence, acceptance criteria, and finite
edge cases that must pass against the real local API.

At minimum, verify these route groups:

- Dashboard: DB OK, investor filter, charts, allocation donuts, performers, no console errors.
- Portfolio: 60+ positions, custody split, grouping, NAV modal, add/edit/import form open states.
- Trades: 240 rows, 40-ish open rows, review/ticker/monthly lenses, detail modal.
- History: explicit 500-row UI list limit, filters, snapshot detail rows, performance `all=true`.
- Investors: owner/observer rows, current value/YTD calculations, add/edit modal validation.
- Settings: scaled asset count, currency/theme controls, refresh/create/export command surfaces.
- Mobile: drawer navigation and table compact/all-columns toggles at 390px width.

Log every issue with route, action, expected result, actual result, screenshot/console/API evidence,
shared-cause analysis, fix, regression test, and rerun result.

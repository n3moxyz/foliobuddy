# Real Local Production-Scale QA - 2026-06-23

## Scope And Safety

- Target: local frontend `http://localhost:4000` backed by local backend
  `http://localhost:4001/api/v1`.
- Data policy: sanitized deterministic seed only. No production database, no `db:sync`, no user
  exports, and no live account data.
- Auth policy: local-only bypass enabled on both sides:
  `ALLOW_LOCAL_AUTH_BYPASS=true LOCAL_AUTH_USER_ID=local-scale-user` for the backend and
  `VITE_LOCAL_AUTH_BYPASS=true` for Vite dev. The backend bypass is ignored in
  `NODE_ENV=production`; the frontend bypass requires `import.meta.env.DEV`.
- Destructive actions skipped in browser: delete all, row deletes, export downloads, production/auth
  admin writes.
- Browser tooling: the in-app Browser plugin was attempted first. Its documented
  `browser.documentation()` helper was unavailable after `agent.browsers.get("iab")`, returning a
  raw Playwright browser object instead, so standalone local Playwright was used for repeatable
  evidence.

## Local Stack Evidence

- Docker Desktop was started locally; existing local container `pa-local-db` was started.
- Prisma migrations applied to the local database:
  `20260615000000_add_position_history`,
  `20260623000000_add_position_history_operation_id`.
- Scale seed result:

```json
{
  "userId": "local-scale-user",
  "assetCount": 60,
  "positionCount": 63,
  "tradeCount": 240,
  "snapshotCount": 390,
  "investorCount": 5
}
```

- Backend API checks passed: `GET /api/v1/health/db`, `GET /api/v1/positions`,
  `GET /api/v1/trades`, `GET /api/v1/snapshots?limit=500`, and `GET /api/v1/investors`
  returned the seeded local rows for the bypass user.
- Frontend served with `VITE_API_URL=http://localhost:4001/api/v1` and
  `VITE_LOCAL_AUTH_BYPASS=true`. Backend was restarted with
  `ALLOWED_ORIGINS=http://localhost:4000`; without that, browser API calls from the Vite frontend
  fail CORS even when the backend is healthy.

## Route Matrix

Detailed source inventory lives in `docs/qa/user-facing-inventory.md`. The corrected compact rerun
exercised the route matrix, modal/open states, invalid numeric guards, export endpoints, copy-safe
actions, mobile smoke, and targeted row-detail behavior against the real local API with zero
application API mutations.

| Route        | Real local evidence                                                                                              | Status                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `/`          | Dashboard rendered, `Net Worth (Scale Owner)`, charts, allocation cards, performers, no sign-in gate             | Pass after local auth bypass fix                                  |
| `/portfolio` | `63 positions`; `Crypto (24)`, `Equities (26)`, `Cash (10)`, `Held for Others (3)`; 60 owned hero positions      | Pass                                                              |
| `/trades`    | `All (240)`, `Open (40)`, `Closed (200)`; Review/Ticker/Monthly lenses render from one fetched dataset           | Pass                                                              |
| `/history`   | `Snapshot History`; `All (391)`, `Automatic (377)`, `Manual (14)` after explicit frontend limit                  | Pass; includes the one BUG-006 repro row pending cleanup approval |
| `/investors` | 5 investor rows, including Scale Owner and zero-stake observer                                                   | Pass                                                              |
| `/settings`  | Display/Data/Export/About controls render; refresh copy shows 81 assets from real API-backed state               | Pass                                                              |
| mobile       | 390px Portfolio and Trades routes load; drawer navigation reaches Trades; Compact/All columns toggles are usable | Pass                                                              |

Corrected compact evidence:

- Full JSON: `C:\Users\User\AppData\Local\Temp\foliobuddy-corrected-inventory-2026-06-23T10-50-23-409Z.json`
- Screenshots: `C:\Users\User\AppData\Local\Temp\foliobuddy-corrected-inventory-2026-06-23T10-50-23-409Z`
- Targeted trade-detail evidence:
  `C:\Users\User\AppData\Local\Temp\foliobuddy-trade-detail-2026-06-23T10-51-19-074Z.json`

Corrected compact summary: counts matched (`positions=63`, `trades=240`, `snapshots=391`,
`investors=5`), route matrix was `6/6`, export HEAD checks were all `200`, relevant console errors
were `0`, relevant network failures were `0`, and Playwright recorded `0`
`POST`/`PUT`/`PATCH`/`DELETE` API requests during the safe pass.

## Interaction Evidence

- Dashboard investor popover: opened and rendered All plus Scale Owner/Partner/Advisor/Sibling
  rows.
- Portfolio add/import dialog: `Add Position` opens, add tab shows category/storage/funding/custody
  fields, import tab shows `Paste from Clipboard` and `Import 0 Positions`.
- Trades: All/Open/Closed filters matched seeded counts; Monthly lens rendered; `Log Trade` dialog
  opened. A targeted rerun from the default Trades view found 240 table rows and opened the first
  row's detail dialog without API mutations.
- History: All/Automatic/Manual tabs switched against the 390-row local dataset. The tab controls
  are Radix tabs (`role=tab`), not plain buttons.
- Investors: Add Investor dialog opened with stake/capital/owner inputs.
- Settings: currency/theme, refresh prices, refresh FX, create snapshot, and export buttons were
  present.
- Mobile: drawer navigation from Portfolio to Trades succeeded; Portfolio had 4 section table
  toggles, Trades had 1 tape table toggle; screenshots wrote to the OS temp directory.
- Console: no application console errors on final focused reruns. Known non-actionable warnings are
  React Router future flags and blocked Google Font requests in the network-restricted Playwright
  browser. Local bypass now skips Clerk runtime entirely and renders an `LB` avatar.

## Safe Open-State Pass

A second pass opened non-destructive menus/modals and cancel paths without confirming destructive
actions or triggering exports:

- Shell: sidebar links were present, the keyboard shortcut modal opened via Ctrl+K, and the mobile
  more-actions menu showed Refresh Prices / Export Data / Dev Mode.
- Dashboard: investor filter trigger rendered; chart periods 7D, 1M, 3M, 1Y, YTD, and Max all
  clicked without console errors.
- Portfolio: overflow menu showed Delete All / Export CSV / Export Excel; Add Position add/import
  modes opened; row Edit Position, Update NAV, and Delete Position dialogs opened and closed.
- Trades: Review/Ticker/Monthly lenses and All/Open/Closed tabs switched; first row opened Trade
  Details; Log Trade add/import modes opened.
- History: All/Automatic/Manual tabs switched; Add Historical Snapshot add/import modes opened;
  Edit Snapshot and Delete Snapshot dialogs opened and closed.
- Investors: Add Investor dialog opened; empty submit was correctly disabled; Edit Investor and
  Delete Investor dialogs opened and closed.
- Settings: command buttons were present. The desktop shell export button was confirmed as a direct
  `window.open(api.exportExcel())` action, so export execution/download was intentionally skipped.
- Console: zero application console errors during the safe open-state reruns.

## Copy, Export, Validation, And Auth Pass

- Portfolio copy: Copy All wrote 63 positions to clipboard; first row Copy wrote one position.
- Trades copy: Copy All wrote 240 trades; row Copy and detail-dialog Copy wrote the same trade
  object shape.
- History copy/expand: Copy All wrote the current 391 local snapshots after BUG-006 reproduction;
  row Copy wrote a snapshot object; clicking an automatic snapshot row expanded 12 nested positions;
  Copy Positions wrote those positions to clipboard and showed `Copied!`.
- Export endpoints: HEAD checks returned 200 and attachment headers for positions CSV, trades CSV,
  open trades CSV, closed trades CSV, and Excel after BUG-005 was fixed. Bodies were not printed or
  saved.
- Snapshot validation: after BUG-006 fix, entering `-1` clears the field, disables Add Snapshot,
  produces no network error, and creates no additional row.
- Required-field states: Log Trade starts disabled without an asset; Add Investor starts disabled
  without a name.
- Benchmark controls: QQQ preset benchmark can be added, appears as a removable benchmark chip, and
  can be removed without console errors.
- Signed-out auth: a temporary Vite server on port 4002 with `VITE_LOCAL_AUTH_BYPASS=false` rendered
  the Clerk sign-in surface and did not render private dashboard data.
- Admin guard: route tests cover non-admin global asset PUT and DELETE returning 403 before mutation
  queries run.
- Local auth bypass rerun: after BUG-007, `/`, `/portfolio`, `/trades`, `/history`, and
  `/investors` rendered real seeded API data with no Clerk provider/script errors.
- Form validation rerun: Portfolio Add Position starts disabled; entering `-1` into quantity clears
  the field and remains disabled. Log Trade starts disabled; entering `-1` entry price clears the
  field, entering `0` quantity remains disabled. Add Snapshot starts disabled; `-1` clears and `0`
  remains disabled.
- Corrected compact validation rerun: Add Position negative quantity cleared to an empty value with
  submit disabled; Log Trade quantity `0` left submit disabled; Add Snapshot negative total cleared
  to an empty value with submit disabled.
- Destructive cancel rerun: Delete All dialogs for Portfolio, Trades, and History opened and
  canceled with counts unchanged (`63`, `240`, `391`). Row delete dialogs for position, trade,
  snapshot, and investor opened and canceled with counts unchanged. Playwright recorded zero
  POST/PUT/PATCH/DELETE API requests during this pass.

## Bug Log

### BUG-003 - Local backend bypass did not let the frontend exercise real authenticated routes

- Evidence: with the backend local auth bypass enabled, the root frontend route still rendered the
  Clerk sign-in screen, so real local seeded data could not be tested as a user without Clerk
  credentials.
- Repro: start backend with `ALLOW_LOCAL_AUTH_BYPASS=true`, seed local data, start frontend with the
  local API URL only, then open `/`.
- Shared cause: authentication bypass existed only in the backend middleware. The React tree still
  gated private routes behind Clerk `SignedIn`.
- Fix: added dev-only frontend bypass helper in `packages/frontend/src/lib/localAuthBypass.ts` and
  used it in `packages/frontend/src/App.tsx`. The bypass requires Vite dev mode and
  `VITE_LOCAL_AUTH_BYPASS=true`.
- Regression: `packages/frontend/src/lib/__tests__/localAuthBypass.test.ts` verifies the dev-mode
  and explicit-flag guards; backend auth tests verify bypass is ignored in production.
- Rerun: Pass; Dashboard rendered local seeded data without the sign-in gate.

### BUG-004 - History hid the scale snapshot dataset

- Evidence: the real local History page showed `All (0)` even though the local API had 390 seeded
  snapshots available with an explicit limit.
- Repro: seed scale snapshots, open `/history`, compare the visible counts with
  `GET /api/v1/snapshots?limit=500`.
- Shared cause: the page comment said "fetch all snapshots" but called `useSnapshots()` with no
  limit. The backend route applies a default page size, and the UI also had no visible query error
  surface.
- Fix: `packages/frontend/src/pages/History.tsx` now requests
  `HISTORY_SNAPSHOT_LIMIT = 500` and renders a visible error message if snapshot loading fails.
- Regression: `packages/frontend/src/hooks/__tests__/useSnapshots.test.ts` covers forwarding an
  explicit snapshot limit to the API client.
- Rerun: Pass; History rendered `All (390)`, `Automatic (377)`, `Manual (13)`.

### BUG-005 - Excel export failed because `History` is a protected worksheet name

- Evidence: `HEAD /api/v1/export/excel` returned 500 while CSV exports returned 200. Backend log:
  ExcelJS rejected worksheet name `History` as protected.
- Repro: run the local scale stack and request the Excel export endpoint.
- Shared cause: the workbook used a user-facing route name as an Excel worksheet name without
  accounting for ExcelJS protected sheet names.
- Fix: `packages/backend/src/routes/export.ts` now names the worksheet `Snapshots`.
- Regression: `packages/backend/src/__tests__/routes/export.test.ts` loads the generated workbook
  and asserts the supported sheet names.
- Rerun: Pass; Excel export now returns 200 with XLSX content type and attachment disposition.

### BUG-006 - Negative snapshot input was converted into a positive snapshot

- Evidence: entering `-1` in Add Historical Snapshot created a local sanitized manual snapshot with
  value `1`, increasing the local snapshot count from 390 to 391.
- Repro: open History, Add Snapshot, enter `-1` for Total Value, submit.
- Shared cause: `FormattedNumberInput` stripped a leading minus for non-negative fields and kept the
  digits, so negative-looking input became positive before form validation.
- Fix: `sanitizeNumberInput()` now returns an empty value for leading-negative input when negatives
  are not allowed, and `SnapshotForm` disables submit unless the USD value is greater than 0.
- Regression: `packages/frontend/src/components/ui/__tests__/formatted-number-input.test.ts`
  verifies negative-looking values are not converted into positive amounts.
- Rerun: Pass; entering `-1` clears the field, submit remains disabled, and no additional snapshot is
  created.
- Cleanup note: one erroneous local sanitized manual snapshot remains from the reproduction. Deleting
  it is a destructive local DB action and needs approval. Current non-destructive DB check confirms:
  `id=cmqqh3rx00001hvcsy0mnf62e`, `userId=local-scale-user`,
  `timestamp=2026-06-23T00:00:00.000Z`, `source=MANUAL`, `totalValueUsd=1`.

### BUG-007 - Local auth bypass still depended on Clerk at runtime

- Evidence: after bypassing the Clerk route gate, browser pages rendered either zero rows while API
  counts were correct (`positions=63`, `trades=240`, `snapshots=391`, `investors=5`) or crashed with
  `useAuth can only be used within the <ClerkProvider /> component` when ClerkProvider was skipped.
- Repro: start the local backend/frontend with bypass flags in a network-restricted browser where
  Clerk script requests are blocked, then open `/portfolio`.
- Shared cause: local bypass bypassed only `SignedIn`/`SignedOut`. `useAuthSetup`, `AppShell`
  `UserButton`, and the Clerk-backed websocket hook still depended on Clerk runtime.
- Fix: local bypass now skips `ClerkProvider`, installs a no-token API getter via
  `useLocalAuthBypassSetup`, renders a local `LB` avatar in `AppShell`, and leaves websocket status
  disconnected for bypass/demo mode instead of calling `useAuth`.
- Regression: `packages/frontend/src/hooks/__tests__/useAuthSetup.test.ts` covers normal Clerk
  token setup and local no-token setup; `useWebSocket.test.ts` covers normal Clerk websocket
  behavior, reconnect status transitions, and portfolio-update invalidation.
- Rerun: Pass; the real local route matrix rendered seeded data and no Clerk provider/script errors.

### BUG-008 - Finance forms had incomplete invalid-submit guards

- Evidence: code review and browser probes found inconsistent guards: `TradeForm` disabled submit
  only when no asset was selected, and `PositionForm` styled invalid submit as disabled but left the
  button clickable. Backend schemas require positive trade/position quantities and positive trade
  prices.
- Repro: open Log Trade or Add Position and inspect submit state with missing/zero/negative numeric
  values.
- Shared cause: numeric validation was split between browser `required`, ad hoc `parseFloat`, and
  visual styling, while backend Zod used clear positive/non-negative contracts.
- Fix: added `formValidation.ts` helpers and wired Trade, Position, and Add/Reduce submit disabled
  states to the same positive/non-negative input rules.
- Regression: `packages/frontend/src/lib/__tests__/formValidation.test.ts` covers positive,
  optional-positive, and non-negative numeric text cases; formatted-number tests cover leading
  negative sanitization.
- Rerun: Pass; invalid finance inputs remain disabled and no mutation requests were emitted during
  the validation/cancel pass.

## Remaining Caveats Before Clean Goal Pass

- Corrected full-inventory-safe rerun passed for route matrix, invalid numeric states, destructive
  cancel paths, copy/export/auth/API checks, and mobile smoke.
- Websocket behavior is covered by explicit harness tests without production credentials:
  `socketService.integration.test.ts` opens real Socket.io clients with mocked Clerk verification,
  proves all-client price broadcasts, proves user-scoped portfolio broadcasts, and rejects missing
  auth; `useWebSocket.test.ts` covers reconnect state transitions and invalidation behavior. Local
  bypass intentionally still renders disconnected websocket status without calling Clerk.
- Cleanup approval is still needed before deleting the one local sanitized BUG-006 repro snapshot:
  `cmqqh3rx00001hvcsy0mnf62e`.

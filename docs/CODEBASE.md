# Codebase File Map

Detailed file references for the agent guides. Paths below are relative to each package unless stated otherwise; behavioral rules remain in [AGENTS.md](../AGENTS.md) and [CLAUDE.md](../CLAUDE.md). Keep this map current when files move.

## Backend

Package: `packages/backend/`.

- `src/index.ts` - Server entry (rate limiting, logger, FX job init, `/api/v1` prefix)
- `src/routes/`/`src/services/`/`src/middleware/` - endpoints; business logic (portfolio/price/snapshot; `unitTrustNavService.ts` = atomic native NAV/USD/position valuation, `providers/FundManagerProvider.ts` + `fundManagerSources.ts` = verified manager share classes); auth + error handling
- `scripts/configure-unit-trust-nav.ts` (dry-run/`--apply` manager mapping) + `scripts/verify-unit-trust-nav.ts` (CI Postgres integration replay; loopback `foliobuddy_nav_test` only) - see [NAV runbook](solutions/2026-09-10-daily-unit-trust-nav.md)
- `src/lib/` - Utils: `constants.ts` (domain enums), `fxConstants.ts` (USD→native FX fields + finite-positive `usdRateEntries()`), `queryParams.ts` (strict bounded integers + real calendar dates), `domain.ts` (backend copy of finite-safe value/cost-basis math), `authorization.ts` (admin + user-asset guards), `startupChecks.ts` (boot warnings), `TTLCache.ts`, + pagination/tradePnL/sentry/logger
- `src/__tests__/` - vitest unit + integration tests (`routes/` = supertest + mocked Prisma; `helpers/` = createTestApp/fixtures; scheduler/socket tests cover cron fanout, WS payloads + real Socket.io clients with mocked Clerk)
- `prisma/schema.prisma` - DB schema; `vitest.globalSetup.ts` probes the generated Prisma client in a child process and regenerates it before tests when missing (keep the probe isolated so backend env does not leak into workers)

## Frontend

Package: `packages/frontend/`.

- `src/App.tsx` (routing); `src/pages/` (Dashboard, Portfolio, Trades, News, History, Investors, Settings); `src/stores/` (Zustand)
- `src/hooks/` - React Query hooks (usePortfolio incl. `useDrawdownStats`, useTrades, …), `useAnimatedNumber` (rAF), `usePageTitle`, `useKeyboardShortcuts` (single-key nav; disableable via `stores/shortcutsStore`, WCAG 2.1.4), `useMoneyFormatter` (monetary privacy); tests in `__tests__/`
- `src/lib/api.ts` (API client), `chunkRecovery.ts` (chunk reload), `types.ts`, `chartColors.ts` (OKLCH CSS-var chart colors), `chartUtils.ts` (time-period date helpers + drawdown math)
- `src/components/ui/` - `skeleton.tsx`, `HelpTooltip.tsx`, `creatable-select.tsx` ("+ Add new ..." Radix Select), `formatted-number-input.tsx` (thousands-separator input; pure helpers in `-utils.ts` for Fast Refresh)
- `src/components/layout/PageActionHeader.tsx` - Sticky title/action header, high-scroll data pages
- `src/components/trades/` - `Trades.tsx` split into `TradeTable.tsx`, `TradeTapeSection.tsx`, `TradeDetailDialog.tsx` (+ `formatTradeTags`), `tradeClipboard.ts`, `TradeLensViews.tsx` + `tradeLensModels.ts` (pure aggregation); page keeps shared state + dialogs
- `src/components/portfolio/` - `positionClipboard.ts`, `positionOptions.ts` (storage options + localStorage customs), `positionFormMath.ts` (pure cost/add-reduce math), `PositionDeltaEditor.tsx`, `PositionCostFields.tsx` + `PositionStorageFields.tsx`, `NavStatus.tsx` + `positionPriceDisplay.ts` (native NAV / valuation date / check status display)
- `react-doctor.config.json` - Root-level React Doctor triage policy

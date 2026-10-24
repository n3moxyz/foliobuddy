# UI contracts

Read the affected section before changing these surfaces. These rules also apply through AGENTS.md and CLAUDE.md.

## Public Landing Page

Signed-out: `/` → lazy `pages/Landing.tsx` (`components/landing/` sections), else `pages/SignInPage.tsx`; signed-in `/sign-in` → `/`. `dark` wrapper forces dark; only deterministic local `landingData.ts` (no API calls); hand-rolled SVG (never recharts); `landing-*` `index.css` utils (reduced-motion covered); never grow the signed-in bundle. **Key-feature rule**: each major user-facing feature (new tab/page, headline capability) → assess landing fit; if yes, usually a `CapabilityBento` on local data (mirror real UI, never fetch); News = reference.

## Responsive Mobile Design

iOS HIG, all pages:

- **Tables → cards**: `PositionTable` → `renderMobilePositionRow` below `md`; full table only on "All columns" (`showMobileColumnToggle`). `mobileVariant` `focus` (symbol+name, value, P&L pill, meta) / `compact` (value + P&L); row actions → 44px `⋮` menu; Trades column-hides (`hidden md:table-cell`).
- **Dialogs**: content-heavy dock full-width to mobile's bottom (`!bottom-0`, rounded top, safe-area bottom padding), centered modal `sm+`; all `w-[calc(100%-2rem)]` + `max-h-[85vh] overflow-y-auto`.
- **Touch**: 44px, compacting `sm+`/`md+`; `Input`/`SelectTrigger`/`DropdownMenuItem`/asset-search options/creatable-select row actions bake `h-11`/`min-h-11` → `sm:`; never redo per-call-site heights; dense row actions need `shrink-0`.
- **Headers**: `flex-col gap-3 sm:flex-row`; secondary actions → `DropdownMenu` overflow.
- Mobile navigation uses a modal Radix dialog. Closed navigation has no hidden focus targets. App shortcuts pause while overlays are open.
- `DialogContent` restores its opener and lets an open asset search consume Escape first. `DialogHeader` reserves close-button space.
- Mobile text inputs use 16px text. Keep import textareas at 16px below `sm`. `SelectItem` has a 44px mobile target.
- `PageActionHeader` measures its sticky height for focus scroll offsets. Dashboard charts use container queries for layout and larger text.

## Dashboard Charts

- **Portfolio Value**: AreaChart, `$`/`%` lens (`%` rebases to range's first positive point); 7D/1M/3M/1Y/YTD/Max; loading `isFetching`. `getDateRange('Max')` MUST send `all=true` to `/snapshots/performance` (empty query defaults to 30 days).
- **Recorded milestones**: `lib/portfolioHistory.ts` builds one chronological timeline with the current quote, even after today's snapshot. Dashboard passes the same dated YTD events to the hero and chart. Keep exact event points when downsampling. Show only events present in the selected range. Small shapes and a muted legend identify start, ATH, MDD trough, daily MDD trough, and live value. Combine coincident legend entries. Tooltips and arrow-key chart navigation expose details. Keep money masked in both chart modes. Tick density follows the chart width.
- **Portfolio % vs Benchmarks**: normalized % vs BTC/ETH/SPX/custom. Keep `provider` + `providerAssetId` (crypto→CoinGecko, TradFi→Yahoo); SPX = `SPY`, not `^GSPC`, via `yahooFinance.chart()`. Failed `priceService.getAssetHistory()` falls back to stored `PriceHistory` (1 point/UTC day; needed for local QA). Baseline = price at first portfolio timestamp. Tooltip renderer `useCallback`'d; inline arrows break memoization.
- **4 donuts**, `AllocationCharts.tsx`; filter custody first: **By Asset** Crypto/Equities/Cash (`bucketFor()`), carve Perps from Cash (`allocationMath.ts`, clamp to cash), slice-click drills detail; **Detailed** Auto=dominant bucket, <2%→Other (`groupSmallDetailedSlices`); **By Storage** CEX splits Cash/Crypto, <3%→Other (`groupSmallStorageSlices`), protect CEX/Onchain; **Cash Breakdown** by symbol. Titles/totals separate header rows; center=top item's %; no Recharts Tooltip (legend overlap); legends 44px targets.
- **Image copy**: every chart card `ChartCopyButton` + `chartCopy.ts` → high-res PNG, exclude button; disable Recharts draw animations (immediate copies must not capture partial SVG). Needs `ClipboardItem` + `navigator.clipboard.write`; toast failures.

## Net Worth Card

Borderless hero, investor title (`Net Worth (Nemo)`). Ordered 9-metric rail: YTD P&L, YTD Start, YTD ATH, MDD, MDD (1D), DD from ATH, Exposure, Positions, Trades. A container at least 60rem wide shares width; narrower containers use: one horizontal snap-scroll rail, 9rem cells, never wrap; visible scrollbar, keyboard-focusable region. Compact footer: alternate USD/SGD total. `useDrawdownStats()` (`usePortfolio.ts`, shared Portfolio hero) → `calculatePortfolioDrawdownStats()` on YTD snapshots + live value: 4 metrics/one pass, positive magnitudes displayed as negative %. `HelpTooltip` labels need distinct accessible `label`; buttons OUTSIDE `<Link>`s, never nest interactive content in links. Key values share `useAnimatedNumbers()` loop.

`useDrawdownStats()` uses `calculateDatedDrawdownStats()` to retain the actual event timestamps. YTD Start uses the summary's `ytdStartDate`. ATH ties retain the first high. MDD dates mark the first deepest trough. Daily MDD compares the final observations of consecutive local calendar days, including today's live value. Missing or invalid days break daily comparisons. Zero declines have no invented trough date. Recorded dates appear in parentheses beneath the four figures. DD from ATH reads `Today (Live)`. YTD history uses the summary's UTC year boundary and includes today's snapshots.

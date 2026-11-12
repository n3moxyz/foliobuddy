# UI contracts

Read the affected section before changing these surfaces. These rules also apply through AGENTS.md and CLAUDE.md.

## Public Landing Page

Signed-out: `/` → lazy `pages/Landing.tsx` (`components/landing/` sections), else `pages/SignInPage.tsx`; signed-in `/sign-in` → `/`. `dark` wrapper forces dark; only deterministic local `landingData.ts` (no API calls); hand-rolled SVG (never recharts); `landing-*` `index.css` utils (reduced-motion covered); never grow the signed-in bundle. **Key-feature rule**: each major user-facing feature (new tab/page, headline capability) → assess landing fit; if yes, usually a `CapabilityBento` on local data (mirror real UI, never fetch); News = reference.

**Hero:** `HeroNetWorthScrub` is a looping Stageshow demo: a pointer scrubs the net worth line, pauses on the max drawdown and rests on the all-time high. `stageshow-kit/` is a vendored MIT subset of Benji Taylor's kit. Keep it verbatim: Prettier ignores it, and the demo imports single files from it, never an index, so the kit's other parts stay out of the bundle. Its tokens map to the app's theme variables in `heroNetWorthScrub.css`. `heroScrubData.ts` samples `PORTFOLIO_CONTROLS` so the drawn peak, trough and end match the landing copy (−9.6% drawdown, +18.4%). A test enforces that match. The stage is `aria-hidden`. Under reduced motion it shows its poster, the drawdown beat. Rehearsal notes, and how to re-film after a change: `components/landing/HeroNetWorthScrub.REHEARSAL.md`.

**Scroll story:** Keep `#story` a focusable fragment target so direct links and browser history work. The animated chart pins below the landing header. Short viewports and reduced motion show the completed chart and all captions in normal page flow. The benchmark legend has its own row below the chart.

## Responsive Mobile Design

iOS HIG, all pages:

- **Tables → cards**: `PositionTable` → `renderMobilePositionRow` below `md`; full table only on "All Columns" (`showMobileColumnToggle`). `mobileVariant` `focus` (symbol+name, value, P&L pill, meta) / `compact` (value + P&L); row actions → 44px `⋮` menu; Trades column-hides (`hidden md:table-cell`).
- **Dialogs**: content-heavy dock full-width to mobile's bottom (`!bottom-0`, rounded top, safe-area bottom padding), centered modal `sm+`; all `w-[calc(100%-2rem)]` + `max-h-[85vh] overflow-y-auto`.
- **Touch**: 44px, compacting `sm+`/`md+`; `Input`/`SelectTrigger`/`DropdownMenuItem`/asset-search options/creatable-select row actions bake `h-11`/`min-h-11` → `sm:`; never redo per-call-site heights; dense row actions need `shrink-0`.
- **Headers**: `flex-col gap-3 sm:flex-row`; secondary actions → `DropdownMenu` overflow.
- Mobile navigation uses a modal Radix dialog. Closed navigation has no hidden focus targets. App shortcuts pause while overlays are open.
- `DialogContent` restores its opener. Escape goes first to an open asset search or a focused `data-cancel-on-escape` box, each closing or cancelling only itself. `DialogHeader` reserves close-button space.
- Mobile text inputs use 16px text. Keep import textareas at 16px below `sm`. `SelectItem` has a 44px mobile target.
- `PageActionHeader` measures its sticky height for focus scroll offsets. Dashboard charts use container queries for layout and larger text.

## Dashboard Charts

- **Portfolio Value**: AreaChart, `$`/`%` lens (`%` rebases to range's first positive point); 7D/1M/3M/1Y/YTD/Max; loading `isFetching`. `getDateRange('Max')` MUST send `all=true` to `/snapshots/performance` (empty query defaults to 30 days).
- **Recorded milestones**: `lib/portfolioHistory.ts` builds one chronological timeline with the current quote, even after today's snapshot. Dashboard passes the same dated YTD events to the hero and chart. Keep exact event points when downsampling. Show only events present in the selected range. Small circles and a muted legend identify ATH, MDD trough, daily MDD trough, and live value. Use the same circle shape throughout, with green ATH, red MDD, amber daily MDD, and blue live markers from `chartColors.ts`. Keep each legend marker and its plot point the same colour. YTD Start keeps its banner date and has no chart marker. Combine coincident legend entries. Chart tooltips explain each event. `PortfolioMilestoneLegend.tsx` shares those explanations and adds hover, keyboard-focus, and tap controls with portaled tooltips. Keep touch targets at 44px and tooltip edges inset from the viewport. Keep money masked in both chart modes. Tick density follows the chart width.
- **Portfolio % vs Benchmarks**: normalized % vs BTC/ETH/SPX/custom. Keep `provider` + `providerAssetId` (crypto→CoinGecko, TradFi→Yahoo); SPX = `SPY`, not `^GSPC`, via `yahooFinance.chart()`. Failed `priceService.getAssetHistory()` falls back to stored `PriceHistory` (1 point/UTC day; needed for local QA). Baseline = price at first portfolio timestamp. Tooltip renderer `useCallback`'d; inline arrows break memoization.
- **4 donuts**, `AllocationCharts.tsx`; filter custody first: **By Asset** Crypto/Equities/Cash (`bucketFor()`), carve Perps from Cash (`allocationMath.ts`, clamp to cash), slice-click drills detail; **Detailed** Auto=dominant bucket, <2%→Other (`groupSmallDetailedSlices`); **By Storage** CEX splits Cash/Crypto, <3%→Other (`groupSmallStorageSlices`), protect CEX/Onchain; **Cash Breakdown** by symbol. Titles/totals separate header rows; center=top item's %; no Recharts Tooltip (legend overlap); legends 44px targets.
- **Period cue**: `animate-chart-period-change` plays only after a period or `$`/`%` change, never on mount. Its key leaves out the last point: that point is the live quote, so a price refresh would remount and re-animate the chart.
- **Image copy**: every chart card `ChartCopyButton` + `chartCopy.ts` → high-res PNG, exclude button; disable Recharts draw animations (immediate copies must not capture partial SVG). Needs `ClipboardItem` + `navigator.clipboard.write`; toast failures.

The portfolio legend and plot share one active milestone kind. Hover, keyboard focus, and tap open its explanation and highlight the matching point with a static ring. Dismissal or a removed milestone clears both. Grouped events highlight their shared point. Live updates retain the selected kind and move its highlight to the current observation. Range and value-mode changes clear the selection. Hide the chart's pointer tooltip while a legend explanation is active.

## Net Worth Card

Borderless hero, investor title (`Net Worth (Nemo)`). Ordered 9-metric rail: YTD P&L, YTD Start, YTD ATH, MDD, MDD (1D), Current ATH DD, Exposure, Positions, Trades. A container at least 64rem wide shares width, reserving at least 10rem for Current ATH DD. Narrower containers use one horizontal snap-scroll rail, 9rem cells, never wrap, with a visible scrollbar and keyboard-focusable region. Compact footer: alternate USD/SGD total. Exposure and Trades show an aria-hidden "-" until their inputs load, with link text "Exposure unavailable — view portfolio" / "Closed trades not loaded — view trade journal"; never a false 0. Exposure also shows "-" when something is exposed against a zero total (perps with nothing owned). A loaded portfolio with nothing exposed is 0.0%. A refresh that fails keeps the last value. `useDrawdownStats()` (`usePortfolio.ts`, shared Portfolio hero) → `calculatePortfolioDrawdownStats()` on YTD snapshots + live value: 4 metrics/one pass, positive magnitudes displayed as negative %. `HelpTooltip` labels need distinct accessible `label`; buttons OUTSIDE `<Link>`s, never nest interactive content in links. Key values share `useAnimatedNumbers()` loop. A loaded value that changes ticks. A value that first arrives shows at once, and so does every value after a currency or investor switch (the hook's `resetKey`).

`useDrawdownStats()` uses `calculateDatedDrawdownStats()` to retain the actual event timestamps. YTD Start uses the summary's `ytdStartDate`. ATH ties retain the first high. MDD dates mark the first deepest trough. Daily MDD compares the final observations of consecutive local calendar days, including today's live value. Missing or invalid days break daily comparisons. Zero declines have no invented trough date. Recorded dates appear in parentheses beneath the four figures. Current ATH DD reads `Today (Live)`. YTD history uses the summary's UTC year boundary and includes today's snapshots.

## Portfolio Hero Summary

Borderless hero (matching Net Worth). **Desktop** (`hidden sm:block`): large tabular Total Value + inline YTD trend arrow, then a 6-col `divide-x` grid (YTD Start, MDD, Current ATH DD, Exposure, Positions, YTD P&L). Keep the grid at least 64rem wide inside a keyboard-focusable horizontal scroll region. Drawdowns use shared `useDrawdownStats()` with the summary's value and timestamp. MDD includes its recorded trough date beneath the percentage. Current ATH DD reads `Today (Live)` beneath its percentage, matching Dashboard. Every label has a `HelpTooltip`. Positions counts owned rows outside the Cash section (fiat cash and stablecoins excluded). Positions held for others are excluded. Show "-" until positions load. **Mobile** (`sm:hidden`): compact bordered card — Total Value, YTD P&L, inline "Add", then YTD Start and MDD side by side. Exposure = owned non-stable/non-cash + server-backed perp ÷ total; custody excluded. Dashboard and Portfolio share `calculateExposurePct()` (`lib/exposure.ts`), which stays undefined (shown as "-") until positions, the summary and the perp setting have loaded, and when something is exposed against a zero total. Gate the perp setting on `usePerpExposure().hasLoaded`, not React Query's `isSuccess`: a failed refresh clears `isSuccess` but keeps the value.

## Portfolio Section Headers

2-level, all breakpoints: **Crypto/Equities/Cash** (`Portfolio.tsx` via `CollapsibleCard`, `icon` + `accentColor`) → **CEX/Broker Account/Bank/Onchain** (`PositionTable`, trigger $ totals). Equities: persisted By Broker/By Type. Accent tokens `crypto`/`equities`/`cash`/`custody` in `index.css`/`tailwind.config.js`, never raw `-500`; custody accent `CUSTODY_CONFIG`. Heading wraps trigger (`<h2><button>`), never reversed: invalid HTML hides headings from SR nav. Desktop `hidden sm:block` full table rows; mobile `sm:hidden` `mobileVariant="compact"`, no column toggle; custody own section on both.

## Perp Exposure Controls

Perps outlive positions (Delete All keeps them), but the Cash section goes with its last owned position. So both Portfolio ⋮ menus (desktop "More options", mobile "More actions") always offer Add Perp/Edit Perp, which opens the USD dialog; its Remove, shown once a value exists, saves 0. Desktop's Cash section adds shortcuts: Add Perp in its header, or the Perp row (Available, inline edit in the display currency, Remove). One gate covers every control: disabled until the setting first loads (`usePerpExposure().hasLoaded`) and while a save or migration runs. A failed refresh keeps the value editable, because a save sends the whole value and reports its own failure. A failed first load shows `QueryErrorNotice` ("Couldn't load perp exposure") with Try again.

## Creatable Storage Location Dropdowns

Only free-text location dropdowns (CEX/wallet/broker/bank) use `CreatableSelect`: no "Others", "+ Add new ..." row; Category/storage type/fiat currency/direction/theme stay fixed.

- Customs: popover pencil/trash pointer-only, Rename/Remove under trigger keyboard; keep both.
- Defaults protected; customs → `foliobuddy-storage-location-options` by storage type (`positionOptions.ts`); delete drops only the option, positions keep value (edit forms re-add one-off).
- Rename changes only the saved name. A capitals-only change renames in place. A name already in the list (built-in, saved or the field's one-off) is refused inline ("Couldn't rename OKX. Binance is already in the list."), never merged; `renameLocationOptionForStorageType()` also refuses built-in and saved names.
- Add/rename boxes carry `data-cancel-on-escape`: Escape cancels only the box, never the Add/Edit Position dialog. Radix refocuses the trigger in a 0 ms timer after the list closes, so a box opened from the list takes focus in `onCloseAutoFocus`; a focused box returns focus to the trigger as it closes.
- `onValueChange` must ignore empties Radix emits on create-row close.
- `SelectContent` sizes to content, above dialogs (`z-[60]`); never force `h-[var(--radix-select-trigger-height)]` or reuse dialog `z-50` (menus open but clipped).

## Motion

Motion confirms an action or orients the user (PRODUCT.md). Keep it off keyboard actions, live data and persistent UI.

- **Pages**: `animate-fade-in-up` on page headers only. No staggered section animations.
- **Keyboard**: a surface opened only from the keyboard (the Cmd/Ctrl+K shortcuts dialog) opens and closes without animation.
- **Theme**: a theme swap is instant. `applyTheme()` turns transitions off until the browser paints one frame of the new theme. Keep that guard when you add color transitions.
- **Tooltips**: one 150 ms fade, only after the hover delay (`data-state=delayed-open`). Focus, taps and the next tooltip along a row (`instant-open`) appear at once. Every tooltip closes at once. Tooltips share the root `TooltipProvider` and its warm window. `HelpTooltip` uses `TooltipProviderIfMissing`, never a provider of its own.
- **Popups**: popovers, dropdown menus and selects scale from their trigger (Radix `--radix-*-content-transform-origin`) with `ease-out-expo`, the `cubic-bezier(0.16, 1, 0.3, 1)` curve of the page and chart cues.
- **Hover**: color or opacity only, at Tailwind's default 150 ms. No hover transforms.
- **Loops**: no infinite animation on persistent UI. Status dots are static. Spinners, skeleton shimmer and pulses run only while something loads. The landing page keeps its own live-dot ping.
- **Per-frame motion**: a hand-written `requestAnimationFrame` or pointer loop writes to the element's `style` through a ref, never to React state. State re-renders the component on every frame. The landing hero scrub is the example: `ScrubMarker` in `HeroNetWorthScrub.tsx` moves the hairline and dot through refs, and the script changes state only when the readout's day changes.
- **Reduced motion**: the `index.css` reduced-motion block zeroes tailwindcss-animate and collapsible utilities through attribute selectors. A plain class selector can't match a variant-prefixed class. The block also stops `.skeleton`. Cover new animation utilities there. Scripted scrolls use `behavior: 'auto'` when reduced motion is on.


## Position Amount Controls

Add New, Edit Totals, and Add/Reduce share `PositionAmountInput`, `PositionAssetSummary`, and `PositionCostFields`. Add/Reduce place Balance above the amount and an estimated USD value below it. Only Reduce adds a clickable balance and percentage buttons (default 25%, 50%, 75%, 100%). Its Pencil editor saves four distinct whole percentages (1–100) through `User.reducePercentages` in `/users/me/preferences`. The defaults apply to all current and future positions across devices. Keep the old buttons until saving succeeds. Cancel and Escape discard edits without closing the position dialog. Typed quantities and the selected button stay in sync. The balance shortcut and 100% preserve the exact balance. Keep read-only balances masked. These controls do not submit.

Quantity inputs use the same bordered input, type size, height, padding, and background as cost/proceeds inputs. Amount panels share cost panels' corner radius and padding. Only editable quantities remain visible when value privacy is on.

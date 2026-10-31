FolioBuddy is a private portfolio dashboard for a small circle: crypto, equities, funds and cash side by side, with live prices, daily snapshots and honest benchmarks. The brand is **composed, sharp and trustworthy** — a Bloomberg terminal that went to a meditation retreat. Numbers are the hero. Chrome stays quiet. Dark mode is the default and the tuned theme.

## Principles

1. **Data speaks first.** Give figures, charts and trends the size and contrast. Keep chrome, borders and decoration in the background.
2. **Quiet confidence.** Choose restraint over flash. No neon, no glow, no gradients beyond the skeleton shimmer.
3. **Density without clutter.** Show a lot, grouped and ranked by hierarchy. Disclose progressively instead of hiding data behind clicks.
4. **Motion with purpose.** Animate only to confirm an action or orient the eye. Never decorate, never slow down.
5. **Designed, not templated.** Avoid identical card grids and admin-panel energy. Every screen should look deliberate.

## Content fundamentals

**Voice.** Plain, calm and exact. Short declarative sentences. State the fact, then what to do. Reassure without cheerleading, even when markets are red.

- Address the reader as "you" and name the product "FolioBuddy". Never "we".
- No emoji, hype words or urgency. The only exclamation mark is the brief "Copied!" on copy buttons.
- Lead marketing with the outcome: "Every asset you own. One quiet dashboard." "The full picture, without the spreadsheet." "Benchmarks that tell the truth."

**Language.**

- Write UK English (decided 2026-10-31). Right: "Cancelled", "5 Sept 2026". Wrong: "Canceled", "Sep 5, 2026".
- Spell with British -ise forms, plus cancelled, catalogue, enrolment and towards (decided 2026-10-31). Keep "Unauthorized" in API errors (the HTTP status phrase), third-party names as their owners write them, and code names such as `realizedPnL`. Right: "Unrealised P&L". Wrong: "Unrealized P&L".
- Use straight apostrophes and quotation marks, a spaced em dash ( — ) between clauses, and the ellipsis character (…) in loading text and placeholders (decided 2026-10-31). Right: "Search for a coin…", "an investor's stake". Wrong: "Search for a coin...", "an investor’s stake".

**Casing.**

- In-app header and dialog actions: Title Case, verb first — "Add Position", "Refresh Prices", "Create Snapshot", "Log New Trade", "Delete All Trades".
- Everything that reads as a sentence uses sentence case: toasts, notices, help text, descriptions and landing calls to action ("Sign in", "See how it works", "Try again").
- Small uppercase labels (`label-caps`, `eyebrow`) are the only all-caps text.
- Headings, card titles, field and metric labels, table headers, tabs, menu items and other buttons also use Title Case (decided 2026-10-31). Inline "Label: value" text, checkbox sentences, and empty-state and error headings stay sentence case. Right: "Win Rate", "Recent Closed Trades". Wrong: "Win rate", "Recent closed trades".
- LONG and SHORT stay in capitals: they are the direction values the JSON import accepts (kept 2026-10-31).

**Names.** Give each page one name, and use it in the sidebar, the shortcut list, the page header and the browser tab (decided 2026-10-31). Right: "Trade Journal" in the sidebar and the header. Wrong: "Trades" in the sidebar, "Trade Journal" in the header.

**Patterns.**

| Situation           | Write it like this                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Success toast       | Noun + past participle, no period: "Prices refreshed", "Snapshot created", "Position copied to clipboard"                                                                     |
| Failure toast       | What failed: "Price refresh failed", "Copy failed". Every failed action shows one; never fail silently                                                                        |
| Load error          | "Couldn't load positions" + "Check your connection and try again." When old data stays visible, prefix "Showing the last loaded data."                                        |
| Empty state         | Heading: "No trades logged". One sentence of value: "Start logging your trades to track performance, win rate, and P&L analytics." Then the action                            |
| Help tooltip        | One or two plain sentences that define the term: "Largest peak-to-trough decline in USD this year. The date below marks the trough."                                          |
| Loading             | Ellipsis character, present tense: "Loading trades…", "Retrying…"                                                                                                             |
| Destructive confirm | Title repeats the action ("Delete Position"). The description names the object and ends "This action cannot be undone." Footer: outline "Cancel", then the destructive button |

**Errors and removals.**

- When a save or delete fails, name the action, then give the cause or the next step (decided 2026-10-31). Show one message per failure: a form that shows the error inline shows no toast. For connection and server faults, use "Check your connection and try again." Right: "Couldn't delete trade" + "Check your connection and try again." Wrong: "Action failed" + "Failed to fetch".
- Match the verb to the effect (decided 2026-10-31). Delete: a record is gone for good. Remove: an item leaves a list, or a value is cleared. Cancel: a history entry is undone. The control, its confirmation and its toast use the same verb. Right: "Remove Binance" for a saved location. Wrong: "Delete Binance".

**Numbers.**

- Set every figure with tabular numerals.
- Per-unit prices scale their decimals to magnitude: under $0.01 → 5, under $0.10 → 4, under $10 → 3, under $1,000 → 2, from $1,000 → 0.
- Totals, sizes and P&L use currency precision: 0 decimals for JPY and KRW, 2 for everything else. Hero totals show 0 decimals.
- Quantities trim trailing zeros and cap precision by asset type: equities 4, unit trusts 3, crypto 8, cash 2.
- Percentages show two decimals and a sign ("+12.40%"). Drawdowns display as negative percentages ("-8.31%").
- An infinite profit factor (wins, no losses) displays "∞". A missing value displays "-" (a missing drawdown "N/A"), never 0.

**Dates and times.** Put the day first and use the 12-hour clock (decided 2026-10-31): "5 Sept 2026", "5 Sept 2026, 2:05pm", "5:00am", "since 1 Jan". Write am and pm in lower case with no space. No leading zero on the day, no month-first dates, and never the browser's own locale format. Right: "5 Sept 2026, 2:05pm". Wrong: "Sep 5, 2026", "05:00", "5:00 AM".

**Privacy.** The eye toggle in the header masks every account amount and holding quantity: in pages, tables, dialogs, chart labels, tooltips and copied chart images. Percentages, counts, chart geometry, public quotes and published NAVs stay visible. Editable inputs are never masked.

**Open (not yet decided, 2026-10-31).**

- "Side" (trades table) or "Direction" (form, stats, export) for LONG and SHORT.
- "completed trades" (Dashboard help) or "closed", the state name used everywhere else.
- "Owner" (desktop badge) or "Primary owner" (mobile card and form).
- The IBKR disconnect flow: "Disconnect My Mac", then "Stop Daily Sync", then "disconnected".
- "% WR" in the collapsed Trade Analytics card, or "% win rate".
- Four phrasings for an empty search: "No results for", "No holding matches", "No matching assets", "No matching holdings".
- "Check saved holdings" in import recovery, which means saved positions.

## Visual foundations

### Color

- **Neutrals are indigo-tinted** (hue 230–234), never pure gray. Build every surface from `background`, `card` and `popover`. Separate them with `border`, not with shade.
- **Fills and text are different tokens.** A fill tuned for surfaces is not always legible as words:
  - `primary` is a fill; indigo words use `primary-text`.
  - `destructive` is a fill; red words use `loss-foreground`.
  - `profit`, `loss`, `warning` and `info` are fills and tints; their words and icons use `profit-foreground`, `loss-foreground`, `warning-foreground` and `info-foreground`.
- **One `primary` fill per view**, for the thing the page is for. Everything else is `outline`, `ghost` or `secondary`.
- **P&L is green and red, never by colour alone.** Gains use `profit-foreground` with an up arrow or "+". Losses use `loss-foreground` with a down arrow or "−". Pills sit on a 12% tint (`alpha-pnl`) of `profit` or `loss`.
- **Category accents mark sections, not data.** `accent-crypto`, `accent-equities`, `accent-cash` and `accent-custody` colour the Portfolio section icons and frames. `accent-macro` marks the News macro lane. They are the same in both themes and weak on light `card`, so the title text always carries the meaning.
- **Charts use only `chart-*` tokens** (via `chartColors.ts`), never inline hex.
  - The portfolio's own line is the neutral slate `chart-portfolio`, so benchmarks read as the comparison.
  - BTC is `chart-btc` and ETH is `chart-eth`. Further benchmarks take `chart-benchmark-1` to `-4` in order.
  - Allocation slices take `chart-asset-1` to `-10`, `chart-storage-*` and `chart-cash-*` in order.
  - Text in a series colour (legends, tooltips) uses its `-foreground` partner.
  - Drawdown markers use `loss-foreground`. The plot surface is `card`.
- **Scrims are black and theme-invariant:** `scrim-dialog` behind dialogs, `scrim-nav` behind the mobile drawer. Never build a scrim from `foreground`.
- `mark-ground`, `mark-violet` and `mark-cream` belong to the logo. Keep them out of UI chrome.

### Typography

- **Plus Jakarta Sans** sets everything. **JetBrains Mono** sets figures inside tables and dense numeric UI (`mono-figure`, `mono-small`) and the landing `eyebrow`. Load both from Google Fonts: `https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap`.
- Use four weights only: 400 body, 500 labels and values, 600 titles, 700 page titles and hero figures.
- **14px (`body`, `body-medium`) is the working size.** `caption` (12px) carries metadata. `micro` (11px) is the floor, always in full-opacity `muted-foreground`.
- Give each screen one hero figure: `net-worth` on the Dashboard, `total-value` on Portfolio. Pair it with a trend arrow and the percentage in `profit-foreground` or `loss-foreground`.
- Each page has one `page-title`. Cards use `card-title`. Dialogs use `dialog-title`.
- Text inputs use 16px below 640px, so iOS does not zoom (`body-lg`).
- Headlines and hero figures tighten to −0.025em. Body text keeps default tracking.

### Spacing and layout

- Work on the 4px scale. `space-2` (8px) is the default gap. `space-1`, `space-3` and `space-4` cover most of the rest.
- **Page gutter:** `space-4` on mobile, `space-6` from lg. **Card padding:** `space-6`; dense section cards use `space-4` × `space-3`.
- **App shell:** a 256px sidebar (`sidebar-width`) that collapses to a 72px icon rail (`sidebar-rail`); a 56px header on mobile and 64px from sm.
- **Page header:** title + muted subtitle on the left, `sm` buttons on the right. It stacks (`gap-3`) below sm. Busy pages pin it under the app header (`z-sticky`) and host their hero stats or lens tabs inside it.
- Put only non-destructive actions (Copy All, Add, Log) in the header. "Delete All" lives in the ⋮ overflow menu.
- **Tables become cards below md.** Wide tables keep content-sized columns and scroll horizontally. Never truncate tickers or names; wrap them.
- Heroes are borderless. The Net Worth metric rail scrolls horizontally in 144px cells (`metric-cell`) until its container reaches 60rem.

### Shape, borders and elevation

- Corners are small and soft. `radius-md` (4px) for controls, menus and notices; `radius-lg` (6px) for cards and dialogs; `radius-sm` (2px) for items inside a control. `radius-full` is only for pills and round hit areas.
- **Borders separate, shadows lift.** A 1px `border` hairline divides cards, rows and headers. `shadow-sm` sits under cards, `shadow-md` under menus and popovers, `shadow-lg` under dialogs and the drawer. Nothing else casts a shadow.
- Sticky headers are the translucent exception: 95% `background` (80% on the landing page) with a backdrop blur.

### States

- **Hover:** ghost, outline and menu items fill with `accent`. Table rows and collapsible headers fill with `muted` at 50%. Primary and destructive buttons drop to 90%.
- **Focus:** every control shows `focus-ring` on keyboard focus only (2px `background` gap, then 2px `ring`).
- **Selected:** the active nav item uses a `primary` 10% fill, a `primary` 30% border, and `primary-text` at weight 600. Active tabs lift to `background` with `shadow-sm`.
- **Disabled:** 50% opacity and no pointer events.
- **Loading:** the `.skeleton` shimmer, with `role="status"` and screen-reader text. Show skeletons only on a first load. A failed refresh keeps the loaded data and shows the warning notice with a retry button. Show an empty state only after a successful empty response.

### Motion

- Entrances ease out on `cubic-bezier(0.16, 1, 0.3, 1)`. Nothing in the product eases in.
- Page headers rise 12px and fade in over 450ms (`animate-fade-in-up`). Sections do not stagger.
- Chart range changes rise 6px over 220ms.
- Dialogs fade and scale from 95% over 200ms. Menus, popovers and tooltips do the same over 150ms. Collapsibles open over 200ms and close over 150ms.
- Pressed landing controls scale to 0.97 over 160ms.
- Charts never animate their drawing, so an image copy never captures a half-drawn line.
- `prefers-reduced-motion` turns every animation off, and Radix exits shrink to 0.01ms so they still unmount.

### Touch and accessibility

- Give every touch target 44px (`touch-target`) below sm. Controls compact to 40px (`control-height`) or 36px (`control-height-sm`) from sm. Bake heights into the component, never per call site.
- Status always carries a word or an icon as well as a colour.
- Headings wrap their trigger buttons (`<h2><button>`), never the reverse.
- Keyboard-activatable rows react only to their own key events, so a nested button's Enter never fires the row.
- Inline errors use `role="alert"` with `aria-invalid` and `aria-describedby`.
- Every help tooltip names its term in its accessible label ("Help: Exposure").

## Iconography

- Use **lucide-react** outline icons at their default 2px stroke, coloured with `currentColor`. No emoji, no illustrations, no filled icon sets.
- **Sizes:** 16px in buttons, menus and table actions; 20px in the nav and beside hero figures; 12–14px for inline help and sort indicators; 40–48px for empty and result states.
- **Gaps:** an 8px gap before a label in standard buttons, 4px in compact header buttons.
- **Fixed pairings:**
  - `TrendingUp` / `TrendingDown` for P&L direction
  - `HelpCircle` for term help
  - `AlertCircle` for warnings and failures, `CheckCircle2` for success
  - `RefreshCw` for refresh (it spins while running)
  - `MoreVertical` for the overflow menu
  - `ChevronRight` for collapsibles (it rotates 90° open)
  - `ArrowUpDown`, `ChevronUp` and `ChevronDown` for column sorting
  - `Eye` / `EyeOff` for value privacy

## Logo

The mark is two rounded slabs, violet (`mark-violet`) and cream (`mark-cream`), on a square `mark-ground` tile.

- Show it as the full tile with `radius-mark` corners: 20px in footers, 32px in the sidebar, 48px above a closing call to action.
- Set the name "FolioBuddy" beside it in Plus Jakarta Sans 600, 18px in the sidebar. No wordmark file exists.
- Never recolour, redraw, crop or float the mark without its ground.
- The app icons (Assets › App icons) are raster exports of the same tile. Keep them in sync with `logo.svg`.

## Using the components

- The components are FolioBuddy's own React 18 library, bundled as `window.FolioBuddy`. Inside the repository, import them from `@/components/ui/*` instead.
- Load React 18, then `components/bundle.css` and `components/bundle.js`, and the two Google Fonts above. Set the theme with `data-theme="dark"` or `data-theme="light"` on `<html>`.
- `bundle.css` carries Tailwind's preflight, every utility class the library and its previews use, and the app's text remaps (`.text-primary`, `.text-destructive`, `.text-profit`…). It reads each colour, radius, shadow and font from the tokens, so a token edit restyles every component.
- Compose layouts with the same Tailwind classes the app uses (`flex gap-2`, `text-sm text-muted-foreground`). Only classes that appear in the library or its previews are compiled.
- Draw icons from `FolioBuddy.Icons` (the lucide set the product uses). Mount `AppToaster` once and fire `FolioBuddy.toast`.
- Dialogs, selects, menus, popovers and tooltips portal to `<body>`. Do not wrap them in clipping containers.

## Not synced

This system holds the theme variables, Tailwind scales, fonts, logo, brand rules and the shared component library. It does not hold: Tailwind keyframes (described under Motion instead), container-query layouts, the runtime `--app-scroll-offset` variable, landing-only utility classes, and the Clerk theme settings. Plus Jakarta Sans and JetBrains Mono are hosted by Google Fonts, so no font files are bundled. Components were built from source: all of `components/ui`, plus `PageActionHeader`, `CollapsibleCard` and `AppToaster`. Not built: `BrandMark` (`components/layout/BrandMark.tsx`, which hard-codes `/logo.svg` — use the Logos asset), the app shell (`components/layout/AppShell.tsx`) and feature components (dashboard charts, position forms, trade and news views).

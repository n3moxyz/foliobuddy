# Rehearsal: landing hero net worth scrub

`HeroNetWorthScrub.tsx` was built with the Stageshow skill (`/stageshow`), filmed in its playground, then moved here.

## Gold copied

- `chart-scrub`: the scrub, one eased stroke per run, and the headline as the readout, with `Roll` on the value.
- `hero-demo`: the frame. It is an app window beside copy, with corner bleed and no plate, on the page's own ground.

## What changed from the gold

- **Look:** the kit's tokens map to the app's theme variables (`heroNetWorthScrub.css`), with Plus Jakarta Sans, JetBrains Mono, the portfolio-line slate and the ATH/MDD marker colors.
- **Data:** the landing page's own year (`PORTFOLIO_CONTROLS`), with Sept and Aug on the axis. The drawn peak, trough and end are exact control points, so the hero quotes the scroll story's −9.6% and +18.4%.
- **Story:** the pointer enters in Nov, pauses on the max drawdown (Mar) and rests on the all-time high (Aug). Then it leaves, and the headline returns to the same live value, so nothing rewinds.
- **Layouts:** wide has the app's collapsed 72px icon rail. Compact has no rail, as the mobile app has none. `fill` grows either design to its column.
- **Milestone dot:** on a milestone, the hover dot takes that milestone's color.
- **Poster:** the max drawdown beat.

## Captured

- The gate passed (`rehearsal passed`) in the playground at 1280 and 390, and in this page at 1280, 1024, 768 and 390.
- The design each width picks: 1280 wide (1.01×), 1024 compact (1.23×), 768 wide (1.43×), 375 compact (1:1).
- The landing page makes zero `/api` requests.
- Reduced-motion posters at both designs. The exit beat frame by frame at 50ms. One independent review: 8 findings, 5 fixed and 3 kept on purpose.
- Frame rate on the live site, 12 November 2026, measured with `requestAnimationFrame` over 12-second rounds:
  - Chrome on a MacBook Air (M5), 1440 wide: 59.3 fps, 3 of 712 frames missed. The long frames came from page load (app boot, Clerk), not the hero.
  - Chrome at phone size (390, touch), CPU slowed 4×: 60 fps, 0 missed. Slowed 6×: 2 or 3 single missed frames a loop, during the strokes.
  - Safari on an iPhone 18 Pro simulator (iOS 27.2), once warmed up: 59.8 and 60.0 fps, 1 and 0 of about 720 missed.
- Touch, in Chrome emulation and in simulator Safari. A swipe that starts on the hero scrolls the page both ways. A tap or a long-press on it does nothing: no navigation, focus, text selection or callout. Offscreen, the stage makes no DOM changes.

## Not checked

- A physical iPhone. The simulator runs Safari's real engine, but draws with the Mac's chip.
- Light theme. The landing page forces dark.
- Remaining film candidates: the value `Roll` settle snap and handoff shift lines. The `chart-scrub` gold shows the same lines. They are kit behavior under a continuous scrub.
- Sampling gaps up to about 48ms on the filming machine. The film coverage is "inconclusive" for motion inside those gaps.

## Re-filming after a change

Copy this component, its CSS and `heroScrubData.ts` into a Stageshow playground copy outside the workspace (`examples/<name>/`). Point the imports at the playground's `kit/`. Then run `node scripts/film.mjs "<url>/?capture=<name>" --gate` at the shown width and at 390.

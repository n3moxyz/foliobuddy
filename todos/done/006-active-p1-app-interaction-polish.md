---
status: complete
priority: p1
complexity: complex
depends-on: []
---

# App interaction and responsive polish

Edward requested Sparkleup across every user flow on mobile and desktop web.
Keep the calm, precise style in PRODUCT.md. Reuse existing components and tokens.

Approach: inspect each route and its actions, fix shared interaction failures first,
then fix page-specific issues. Preserve financial contracts and production data.

- [x] Inspect landing, navigation, Dashboard, Portfolio, Trades, News, History, Investors, and Settings.
- [x] Check forms, searches, menus, dialogs, imports, copy/export, and recovery states.
- [x] Fix observed keyboard, focus, responsive, touch, and feedback problems.
- [x] Inspect changes at narrow, medium, and wide widths in light and dark themes.
- [x] Verify relevant interactions with the real local sandbox and browser engines available here.
- [x] Run project checks and document coverage and hardware limits.

Selected skills: frontend-design, adapt, better-accessibility, harden,
and emil-design-eng. PRODUCT.md supplies the approved design context.

Acceptance: observed interaction defects are fixed, checks pass, and the coverage
record states exactly which browser and device checks ran.

Completed: 20 October 2026. All 472 frontend tests passed. Build/typechecks,
formatting, shell/domain checks, and lint passed. Lint retains six existing
warnings. Chromium/Firefox/WebKit checks covered 156 page/form states with no
axe violations or page overflow. Four landing widths and separate larger-text,
landscape, error, and saved-action checks passed.

See [coverage and limits](../../docs/solutions/runtime-errors/2026-10-20-app-interactions.md).
Physical devices, Windows, screen readers, hosted Clerk login, and live IBKR
permissions were not exercised. No production changes or deployment occurred.

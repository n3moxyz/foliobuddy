# Live trade P&L preview verification

Verified on 2 October 2026 in the real local sandbox from this worktree, on
`http://localhost:4200/trades` with fictional portfolio data.

The create/edit form shows a compact inline `Net P&L:` amount and return below
Funding Cost and above Notes. Long price P&L is `(exit - entry) × quantity`;
short price P&L reverses the difference.
Funding is deducted before calculating return on `entry × quantity`, matching
the backend's saved-trade formula. Previewing needs no asset selection or API
request.

## Checks

- Frontend suite: **55 files, 397 tests passed**, including live form input changes,
  long/short results, fractional prices, funding turning a gain into a loss,
  neutral break-even, incomplete/open trades, invalid and overflowing arithmetic,
  masking the monetary amount while retaining the percentage, and preview
  placement below Funding Cost and above Notes.
- Frontend production build/typecheck passed.
- ESLint on all four changed/new frontend files passed.
- Root `npm run format:check` passed, including shell syntax and domain parity.
- `git diff --check` passed.
- Browser inspection of the promoted Inline layout: normal in-app viewport,
  1024 × 900 and 390 × 844, using the sandbox's dark theme. The mobile preview
  measured 28px high with equal 318px content/client widths and no overflow.
- Entering 100 / 125 / 10 with funding 20 showed
  **Net P&L: +$230.00 +23.00%**. Typing another 0 while the funding input stayed
  focused changed it to **+$50.00 / +5.00%** immediately. Funding 300 showed
  **-$50.00 / -5.00%**; clearing funding restored **+$250.00 / +25.00%**.
- Earlier calculation/privacy verification covered light/dark themes, a live
  SHORT result of **-$270.00 / -27.00%**, the existing ETH short's saved
  **+7.74%**, and masking money without hiding return. The promoted layout's
  unit tests retain those calculation and masking checks.
- The three isolated prototypes were removed after Inline was selected. Test
  entries were previewed without submitting a trade. Browser sizing was restored,
  and the final implementation is open in the in-app browser at port 4200.
- Browser console contained only the existing React Router v7 future-flag
  warnings, with no application errors.

## Existing limits

Full frontend lint still reports six errors in untouched files:
`HeroDashboard.tsx` (one), `useLandingMotion.ts` (one), `ibkrDirectSync.ts` (three)
and `lib/api.ts` (one). Its six warnings are also outside this change. The pinned
dependency install reported 21 audit findings; this change adds no dependency
and leaves the lockfile unchanged.

This records pre-publication local verification. Production deployment and form
behavior are verified separately after merge.

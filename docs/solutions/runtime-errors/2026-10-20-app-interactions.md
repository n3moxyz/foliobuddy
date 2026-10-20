# App interaction and responsive polish

Date: 20 October 2026. Scope: the whole FolioBuddy interface.

The pass preserves the calm, precise style in PRODUCT.md. It uses the existing
React, Radix, Tailwind, typography, and color tokens. It adds no app dependency.

Sparkleup selected frontend-design for consistency, adapt for layout,
better-accessibility for keyboard behavior, harden for recovery, and
emil-design-eng for interaction details.

## Findings and fixes

| Severity | Location                         | Before                                                                                                             | After                                                                                                               | Why                                                                |
| -------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| High     | AppShell                         | Closed mobile navigation remained focusable. Open navigation allowed background focus.                             | A Radix modal controls mobile navigation, Escape, focus containment, and focus return.                              | Keyboard access and focus order, WCAG 2.1.1 and 2.4.3.             |
| High     | Keyboard shortcuts               | Navigation keys could leave a dialog or menu while the user operated it.                                           | App shortcuts pause while a dialog, menu, or listbox is open.                                                       | Prevents accidental navigation during an active task.              |
| High     | Landing and dashboard layout     | Phone grids widened the landing page. Large text squeezed charts and statistics beyond their containers.           | Explicit phone columns and container queries keep content within the page. Statistics keep their own scroll region. | Reflow and text resize, WCAG 1.4.10 and 1.4.4.                     |
| Medium   | Shared dialogs                   | Long headings competed with the close button. Controlled dialogs lost their opener.                                | Headings reserve space, dialogs scroll within the viewport, and close returns focus.                                | Keeps dismissal and keyboard continuation predictable.             |
| Medium   | Asset searches                   | First Escape could close the form. Delayed blur raced option selection.                                            | First Escape closes search. Pointer selection retains input focus. Results use one keyboard focus path.             | Keeps entered form data available and supports keyboard selection. |
| Medium   | Core page queries                | Failed loads could resemble empty portfolios, trades, or investor lists.                                           | Shared retry controls distinguish failures from empty responses and retain loaded data.                             | Gives the user an explicit recovery action.                        |
| Medium   | Investors                        | Phone users needed horizontal scrolling to find actions. A full allocation still offered an impossible submission. | Phone cards expose values and actions. The form explains full allocation and offers Cancel.                         | Keeps common actions visible and explains unavailable actions.     |
| Medium   | Filters and snapshot history     | Filter tabs referenced missing panels. Expansion state sat on table rows.                                          | Tabs control real panels. Named native buttons expose snapshot expansion state.                                     | Correct names, roles, and states, WCAG 4.1.2.                      |
| Medium   | Allocation charts                | Chart segments had no names. Desktop legend targets were too small.                                                | Segments have names and percentages. Legend targets stay at least 32px tall on desktop.                             | Accessible names and target size, WCAG 1.1.1 and 2.5.8.            |
| Medium   | Form controls and imports        | Small phone input text could trigger browser zoom. Import errors lacked field relationships.                       | Phone inputs use 16px text. Select items use 44px targets. Import fields reference announced errors.                | Easier touch input and error identification.                       |
| Low      | Chart controls and page headings | Selected chart periods and benchmarks lacked pressed states. A trade count did not say it counted closed trades.   | Controls expose state. The journal labels its closed-trade count.                                                   | Makes the displayed state easier to understand.                    |

The pass also removed landing render-time mutation and preserved original causes
when IBKR helper errors are rethrown. These changes resolved existing lint errors.

## Coverage

The real sandbox ran against its separate local sample database. Writes used
sample records. Test-created positions, trades, snapshots, and investors were
removed. The sample owner's stake returned to its original value.

| Surface        | Checked actions and states                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Public landing | Phone, tablet, desktop, story link, sign-in link destinations, reduced motion.                                                            |
| App shell      | Mobile menu, desktop navigation, keyboard focus, overlay shortcuts, currency, privacy, theme.                                             |
| Dashboard      | All chart periods, currency and percentage lenses, benchmark add/toggle/remove, allocation filters, chart image creation.                 |
| Portfolio      | Search by keyboard and pointer, search dismissal, crypto create/edit/add/reduce/delete, equity and cash form variants, import validation. |
| Trade Journal  | Create, P&L preview, detail, copy, edit, delete, lenses, filter tabs, import validation.                                                  |
| News           | Holdings search, holding dossier, return to feed, feedback menu, refresh state.                                                           |
| History        | Create, edit, copy, delete, source filters, keyboard expansion, import validation.                                                        |
| Investors      | Phone actions, create/edit/delete, stake reassignment, full-allocation explanation and cancellation.                                      |
| Settings       | Appearance, shortcuts, schedule controls, price/FX/snapshot success and failure feedback, export controls.                                |
| Export files   | Real local Excel and positions/trades CSV responses, including open and closed trade filters.                                             |
| Edge states    | Failed first loads and retry, empty lists, long investor names, landscape, 200% root text size, forced colors, reduced motion.            |

Refresh failure tests used intercepted responses. Chart clipboard tests captured
generated clipboard items without replacing the user's system clipboard.

## Verification

- Full workspace build and typechecks passed.
- Frontend: 472 tests passed across 62 files.
- Frontend lint passed with six existing warnings and no errors.
- Formatting, shell-script syntax, and shared-domain checks passed.
- Chromium covered 92 page/form states at 320, 390, 768, and 1440px, in light and dark themes.
- Firefox and WebKit each covered 32 page/form states at phone and desktop widths.
- The browser scans checked WCAG A/AA rules with axe after entrance animations finished.
- The final browser scans found no rule violations or page-level horizontal overflow in those states.
- Four landing widths passed the same checks. Enlarged-text and landscape checks passed separately.
- Saved-action browser checks covered ten grouped user flows with no page errors.

Screenshots and raw local reports were inspected during the pass. Disposable
verification scripts and browser downloads stayed outside the repository.

## Limits

Browser engines ran on macOS. Phone sizes and touch were emulated. Physical iOS,
Android, Windows, Edge-specific behavior, VoiceOver, NVDA, and JAWS were not tested.
Forced colors were emulated, rather than observed on Windows hardware.

Local Clerk credentials were absent. The real landing component ran through a
temporary local preview entry. Sign-in link destinations were checked, but hosted
Clerk login and account recovery were not exercised.

Live IBKR owner enrollment, local helper permissions, provider accounts, and
production mutations were outside this UI check. Existing component tests cover
IBKR interaction states. Production export authentication still needs a signed-in
account check. No commit, push, merge, or deployment forms part of this pass.

No actionable accessibility findings remain in the inspected states. Approve
for the inspected coverage. The limits above remain unverified.

## Prevention

- Use the shared query notice when a page needs retry behavior.
- Keep expansion state on the actual button, rather than on an ordinary table row.
- Test Escape with the search open inside its real dialog. Radix handles Escape during capture.
- Measure available container space for dense dashboard layouts.
- Wait for entrance animations before automated contrast measurement.
- Keep keyboard and query-recovery regression tests when changing shared controls.

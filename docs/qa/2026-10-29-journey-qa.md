# Five-perspective journey QA

Date: 29 October 2026, Singapore time.

Five independent browser explorations found eight confirmed defects. A final
combined check found one additional count-label defect. Repairs
prioritize duplicate financial records, then accessibility and misleading displays.
The audit used the real local frontend, API, and PostgreSQL with synthetic users.
Product code stayed unchanged until discovery was consolidated.

## Conditions

- Chrome 156 on macOS, with fresh browser contexts and dark theme.
- Desktop: 1440 × 1000. Responsive checks: 375, 390, 414, 768, and 1440px.
- Touch emulation: 375 × 812 and 414 × 896. Reduced-height check: 414 × 480.
- Moderate network: 150ms latency, 204800 B/s download, 92160 B/s upload.
- Slow network: 400ms latency, 50000 B/s download and upload.
- One empty account and four populated accounts had separate user IDs and app instances.
- Populated fixtures started with 15 positions, six trades, two investors, and 400 snapshots.
- Testers preserved the original sandbox account. All writes used synthetic QA users.
- Production browsing covered landing, sign-in, and read-only capability and health checks. No production financial records changed.

Browser interception deliberately tested failed requests and lost committed
responses. Each such intervention is identified in the evidence. Saved writes
and arithmetic were checked against the real API. Screenshots, accessibility
trees, request records, and traces were inspected and kept outside version control.

## Confirmed findings and repairs

| ID      | Priority | Trigger and before                                                                            | Repair                                                                                                                                                         | Verification                                                                                                           |
| ------- | -------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| JQA-001 | P2       | Double-click Log Trade during latency. Two records added $30 instead of the intended $15.     | A synchronous submit guard permits one active create or edit. Failures show inline feedback and allow retry.                                                   | Real API: one POST, one row, and $15. Failure retained input without an unhandled rejection.                           |
| JQA-002 | P2       | Import committed, its response was lost, and retry created another holding.                   | User-scoped request identities retain committed rows. Partial retries, failed-row editing, pending controls, and late acknowledgements preserve that identity. | Real PostgreSQL concurrency and browser lost-response, reopening, partial retry, and overlapping-dialog checks passed. |
| JQA-003 | P2       | Mobile Held for Others appeared as text without its desktop heading role.                     | The mobile label is an h2. Related help controls name their topics.                                                                                            | Heading tree, help, keyboard focus, and rendered checks passed at all five widths.                                     |
| JQA-004 | P2       | An empty account's asset choices said In portfolio because they came from the shared catalog. | Removed unconditional ownership badges from Portfolio and Trades search choices.                                                                               | Empty-account choices remain selectable without claiming ownership. No API or access policy changed.                   |
| JQA-005 | P3       | Mobile investor selector measured 22px high.                                                  | Removed the flex rule that overrode its existing mobile button height.                                                                                         | 44px at 375/390/414px. Desktop remains 36px. Keyboard filter and Escape still work.                                    |
| JQA-006 | P3       | Derived Average Cost displayed 26.9265111111111 in a narrow disabled field.                   | Inactive averages use price precision. Inactive totals use currency precision.                                                                                 | Rendered checks and raw-value/mode-switch tests passed. Stored arithmetic and editable precision remain intact.        |
| JQA-007 | P3       | Worst Performers said No positions yet after a profitable holding was saved.                  | Existing position count distinguishes no owned holdings from no unrealized gains or losses.                                                                    | Zero, positive, negative, and flat-position cases passed. Real Dashboard wiring was inspected.                         |
| JQA-008 | P3       | Hosted sign-in identified the app as PA Portfolio Dashboard.                                  | Clerk presentation strings identify FolioBuddy.                                                                                                                | SDK typecheck passed. The deployed native component visibly says Sign in to FolioBuddy.                                |
| JQA-009 | P3       | A one-holding Portfolio header said 1 positions.                                              | The header uses the singular label for one holding.                                                                                                            | Actual 375px one-holding rendering and normal plural route checks passed. Counts and calculations are unchanged.       |

The [import retry runbook](../solutions/2026-10-29-position-import-retries.md)
documents the protocol and its receipt lifetime. Backend support ships before
the updated client. No schema migration, additional dependency, authentication
policy change, or live configuration change forms part of these repairs.

## Journey results

| Perspective    | Completed checks                                                                                                                                         | Result                                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Newcomer       | Landing to sign-in, empty Portfolio, first holding, failed save and retry, Dashboard effect, reload, responsive navigation.                              | Passed after repairs. Synthetic 0.1 BTC at $6000 cost appeared at $9500 value and persisted. Hosted authentication was blocked without test credentials.              |
| Reconciler     | Non-USD holding, funded addition, weighted cost, persistence, history cancellation, custody exclusion, long/short P&L with funding.                      | Passed under the existing valuation contracts. Cancellation restored the starting holding and cash balances. The frozen fiat-cash quote limitation is recorded below. |
| Mobile         | Touch chart, privacy, statistics swipe, holding details, update, failed save, slow pending state, last-good data, retry, wider and reduced-height views. | Passed. A deliberately failed summary refresh kept loaded data. Removing the failure and tapping Try again recovered.                                                 |
| Literal reader | Visible help and labels, keyboard funded add/reduce, privacy in details/history/previews, dialog Tab containment, navigation Escape, mobile actions.     | Passed after the heading repair. Adding 0.01 BTC for $900 debited USDC by $900. Selling 0.01 for $950 credited $950.                                                  |
| Breaker        | Invalid amounts/JSON, repeated clicks, pre-server failure, committed-response loss, partial import, failed deletion, retry and recovery.                 | The two duplicate-write defects now pass. Remaining untested cases are listed below.                                                                                  |

## Import recovery checks

- Two concurrent requests with one user, request ID, and payload created one holding.
- Concurrent different payloads with the same identity produced one winner.
- The same request ID in two accounts created separate owned rows.
- Changed committed payloads were rejected before catalog mutation.
- Identical rows inside one batch remained separate. New acknowledged batches remained intentional imports.
- A fresh API process replayed a committed batch without adding a row.
- Lost committed response, dialog closure, reopening, and retry retained one holding.
- A real partial batch retained its successful row through retries. Editing retained only the failed row by index.
- A later retry committed the previously failed row, then lost its response. Stale failed-row editing stayed blocked until same-ID replay confirmed success.
- That uncertain partial-retry check changed row counts from 22 to 23 to 24. Replay retained 24 rows and preserved native decimals.
- Overlap test: old dialog A committed, B reused its identity, A replied after unmount, B lost its reply, and B retried safely.
- Explicit acknowledgement released a successful attempt. A deliberate new identical import then received a fresh identity.
- Account changes during capability checking or response decoding could not complete the previous account's client operation.
- Pending import controls and mode switches stayed disabled. Fractional amounts and custody survived failed-row editing.

## Observations resolved without changing contracts

The benchmark comparison uses recorded snapshots. Portfolio Value also includes
the live value. The observed 37.1989% live return and 36.7318% recorded return
therefore used different endpoints. No incorrect stored calculation was established.

Trade tape and detail amounts deliberately use USD. Aggregate analytics convert
to the display currency. Switching to SGD did not change the recorded trade P&L.

Fiat cash retains its creation-time USD quote, as documented in FORET.md. In the
stale fixture, SGD400 cost consumed 421.146 cash units because the cash quote and
current FX differed. Cancellation restored exactly 25000 units. This exposed the
existing valuation-policy limitation, rather than a newly introduced calculation.
Changing that policy requires a separate product decision. This audit did not revalue stored cash.

The empty Dashboard's lack of a direct first-holding action remains a usability
concern. The actual journey succeeded through Portfolio's clear Add Position action.
Edit Totals explanatory copy also remains a concern without an observed task failure.

An apparent funding-picker failure was rejected as screenshot-capture interference.
One focus-loss observation did not reproduce in two controlled rechecks. Neither
received a speculative code repair.

## Validation

- Backend: 807 tests passed across 62 files.
- Frontend: 574 tests passed across 74 files. Simple wording received rendered checks.
- Workspace build/typechecks and helper tests passed.
- Formatting, shell syntax, shared-domain checks, and whitespace checks passed.
- Frontend ESLint passed with six existing warnings and no errors.
- All seven app routes loaded at desktop and phone widths without page errors or page-wide overflow.
- Targeted repairs received rendered and interaction checks after each coherent batch.

## Coverage limits

These checks do not establish that the entire application is defect-free.
They used Chromium emulation. Physical phones, Windows-specific behavior, other
browser engines, actual assistive technology, and physical soft keyboards were not tested.
Reduced viewport height was a keyboard-obstruction surrogate.

Hosted sign-in completion, session expiry, live IBKR permissions, real broker
accounts, and production data mutations were not tested. No owner credentials were used.
Local Vite loading does not establish production performance under field networks.

Trade-create/import response loss, failed trade deletion, and browser Back with
unsaved inputs remain untested. The reconciler covered funded-addition history
cancellation. Funded-reduction failure recovery was not tested.

Pending client import identities do not survive a full page reload or a new
auth session. Deleting an imported row removes its durable receipt. Check saved
holdings before reimporting an uncertain batch after either boundary.

## Release verification and cleanup

- Backend [PR #82](https://github.com/n3moxyz/foliobuddy/pull/82) merged as `8864ddce749f621901e75dd224dc8274040e9ba9`.
- [Deploy Backend](https://github.com/n3moxyz/foliobuddy/actions/runs/40745469503) verified that exact Coolify commit, then passed its health check.
- The live frontend capability route advertised `bulkImportIdempotency: true` before client publication.
- Client [PR #83](https://github.com/n3moxyz/foliobuddy/pull/83) merged as `1003b07567b3668a95f800bb24e42d33038f0d88` after CI and review passed.
- Vercel marked that exact client commit Ready and assigned `foliobuddy.xyz` to its production deployment.
- The hosted Clerk component visibly rendered Sign in to FolioBuddy. No credentials were entered.
- The [Production Check](https://github.com/n3moxyz/foliobuddy/actions/runs/40749274368) passed on the client merge commit. Portfolio, collection, News, holding-page, and network-isolation checks passed.
- Public API health and the frontend-to-database health route returned `status: "ok"`.
- Final QA records were archived. The original sandbox user, positions, history, trades, investors, and snapshots matched the saved baseline exactly.
- Only the five synthetic QA users and isolated retry asset were removed. Audit servers stopped. The original sandbox remains available on 4100/4101.

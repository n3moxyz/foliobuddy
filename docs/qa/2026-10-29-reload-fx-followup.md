# Import reload recovery and fiat cash FX

Date: 29 October 2026, Singapore time.

Edward requested repairs for the two remaining limits from the journey audit.
This follow-up used the real frontend, API, and PostgreSQL with synthetic records.
Its database ran in a separate local container. The original sandbox was not used.

## Import recovery

Pending payloads and request IDs survive a full reload in the same tab and
sign-in session. Resume requires a click. It replays the original request ID.
An unknown result locks input. Storage failures block submission before dispatch.
Account/session/API scopes isolate recovery. Logout clears the financial payload,
including after reload without reopening Import.

Confirmed partial results save a failed-row correction draft and seal the original
batch in one storage write. Reload restores that editable draft. Its request ID
stays fixed once dispatched. Re-pasting the sealed original stays blocked, including
after the correction succeeds. This prevents saved rows from being imported twice.

The 375px touch-emulated browser check let an import really commit, then dropped
its response. A full reload restored its exact payload, native decimals, custody,
and request ID. Retry added no rows. Explicit success acknowledgement then allowed
a deliberate new identical import. There were no page errors.

A second real check returned partial success, opened failed-row editing, and
reloaded before submitting the correction. The correction draft survived.
Re-pasting the original sent no request. Submitting only the corrected row added
one position. The original remained blocked after that success.
An all-rows-failed check also restored its correction draft after reload. After
correction success and another reload, the original sent no further request.

Regression coverage also tests delayed clipboard completion, monetary privacy,
logout, malformed/blocked storage, stale acknowledgements, and overlapping dialogs.
A new sign-in clears prior-session recovery even if the previous session expired during reload.
A confirmed signed-out startup also clears it. Auth loading preserves recovery.

## Fiat cash FX

Manual USD, SGD, and GBP cash use validated current rates. Existing creation-time
quotes no longer control current value or funding. Native balances, recorded
USD basis, history, and past snapshots remain intact. Stablecoins and managed
IBKR aggregate balances keep their existing rules.

Real database checks confirmed:

- SGD25000 became SGD24600 after an SGD400 funded purchase. Cancellation restored SGD25000.
- SGD100 proceeds credited exactly SGD100. Cancellation restored the starting balance.
- Same-currency funding still used exact native units after USD FX changed.
- Insufficient funds and stale destination FX saved neither side of a transfer.
- An injected position-valuation failure rolled back FX rates, asset quotes, and current values together.
- A valid FX refresh changed current USD values without changing native quantities or recorded basis.
- A cash import and same-ID replay worked with a one-connection database pool and retained one row.
- A cash-only snapshot retained its native value when provider FX differed from stored FX. Summary and rows used one stored view.

Provider fallback bypasses old stored/cache rates and retains the quote's source
timestamp. GBP has a real provider mapping. The FX job refreshes at startup and
keeps its hourly schedule.

## Limits and release checks

Recovery is tab and sign-in-session scoped. Closing the tab, clearing browser
data, or starting a new sign-in session ends it. Deleting an imported position
removes that row's backend receipt. Unsaved correction edits can still be lost.
Check saved holdings before reimporting across those boundaries.

These checks do not cover physical phones or hosted sign-in completion.
No production financial mutation was used for testing. Current FX valuation
does not reconstruct historical FX or rewrite past snapshots.

Local validation passed: 826 backend tests, 590 frontend tests, both builds,
frontend lint, formatting, shell checks, and domain parity. Lint has six existing
warnings and no errors.

[PR #85](https://github.com/n3moxyz/foliobuddy/pull/85) released commit
`dfe4acd520ffe896e1f079877013bd48f4693e05`.
[Main CI](https://github.com/n3moxyz/foliobuddy/actions/runs/40823310988) passed.
The [backend deployment](https://github.com/n3moxyz/foliobuddy/actions/runs/40823310992)
confirmed that exact commit and passed its health check. Vercel promoted the same
commit to `foliobuddy.xyz`.

The [Production Check](https://github.com/n3moxyz/foliobuddy/actions/runs/40824455635)
passed the portfolio, private X collection, news feed, and holding-page checks.
SGD and GBP rates through the frontend API were positive and under one minute old.
The backend health route and frontend database health route both returned HTTP 200.
A fresh 375px browser confirmed signed-out startup clears synthetic expired recovery.
Protected links showed sign-in, with no page errors or financial API requests.

The disposable QA servers, database container, and its volume were removed after
saving the synthetic database and evidence. The original sandbox was not changed.

# Position imports after a lost response

## Problem

An import could commit before the browser lost its response. The form kept its
JSON and offered another import. A retry then created another holding with the
same quantity, basis, and value.

## Backend repair

`POST /positions/bulk` accepts an optional UUID `requestId` alongside `positions`.
The server derives each position ID from the authenticated user, request ID,
validated batch contents, and row index. PostgreSQL retains that identity in the
existing position primary key. No schema migration or additional dependency is needed.

The row transaction returns success when that position already exists. It does
not overwrite the saved quantity or cost. Serializable transactions retry unique
key and serialization conflicts through the existing `navTransaction` helper.

An existing request ID cannot import different contents. The server checks this
before catalog mutation, then checks again in the first successful row transaction.
Each row keeps its normal success or failure result. Retrying a partial batch
retains successful rows and retries the remaining rows.

Different row indexes preserve intentional identical rows in one batch. A new
request ID permits a separate import of the same contents. Legacy callers that
omit `requestId` keep their previous behavior and do not receive retry protection.

Import logs now contain the row count instead of financial payload contents.

## Client requirements and rollout

`GET /positions/native-cost-capabilities` advertises `bulkImportIdempotency: true`.
Deploy and verify this backend before publishing the updated client.
The updated client checks this flag before sending an import. An older backend
must leave the import unavailable rather than silently discard its retry identity.

Keep the same request ID after a lost response and when retrying a partial batch.
Save the full payload and request ID in session storage before dispatch.
Recovery stays scoped to this tab, API destination, owner, and sign-in session.
A full reload offers an explicit Resume action. It never automatically submits.
Recovered uncertain input stays read-only until the server confirms the outcome.
Hidden monetary values also hide recovered read-only JSON.
Storage failures block submission before the server can receive an untracked write.
Release an attempt only after visible acknowledgement of complete success.
An unmounted form's late response must not erase another form's retry identity.

Clear acknowledged results before every retry. A lost or incomplete response
leaves the outcome unknown, even when earlier results remain visible. Keep
failed-row editing disabled until same-ID replay confirms the latest outcome.
An unknown outcome must not release the pending identity through Close Import.

To correct a confirmed result, retain only failed rows by their result indexes.
Atomically seal the original journal entry and save the failed-row draft before editing.
The draft has its own request ID, including when every original row failed.
Its payload can change only before first dispatch. Stale dialog references cannot
revive sealed entries or replace dispatched payloads.
Reload restores that draft for editing. Re-pasting the sealed original stays blocked,
including after its correction succeeds, so earlier successful rows cannot duplicate.
Do not identify rows by ticker. One batch can contain several holdings of the same asset.

## Verification

- Backend regression tests cover replay, concurrent requests, partial failure,
  changed payloads, user isolation, and intentional repeated rows and imports.
- Real local PostgreSQL 17 checks confirmed one position for simultaneous retries.
- Simultaneous changed payloads produced one winner and no second holding.
- Rejected changed payloads created no additional catalog asset.
- The same request ID created separate positions for two synthetic users.
- A fresh API process replayed the committed request without adding a position.

Browser recovery and client checks are recorded in the dated journey audit.

## Limits

The position itself is the durable receipt. Deleting any imported position removes
that row's receipt. A replay can recreate the deleted row. Remaining rows retain
their retry protection.

Client recovery survives full reloads within this tab and sign-in session.
Logout clears its financial payload even after reload without reopening Import.
Confirmed signed-out startup and a different session also clear prior recovery.
Closing the tab, clearing browser data, or starting a new sign-in session removes
this recovery boundary. Check your saved positions before reimporting after those events.
Sealed partial receipts remain until that boundary. Unsaved draft edits can be lost.

This repair covers position imports with request IDs. It does not establish
exactly-once behavior for other create endpoints or older clients.

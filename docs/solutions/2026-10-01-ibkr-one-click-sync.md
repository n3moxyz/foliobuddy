# One-click IBKR sync on a Mac

**Sync IBKR** replaces the chat handoff. After one-time setup, clicking it reads
IBKR, checks the capture, saves a private checkpoint, applies the reviewed values,
and independently verifies the saved records. Keep the Mac awake and FolioBuddy
open until the result appears. There is no chat prompt, Send step or model turn.

The helper reuses the existing Interactive Brokers plugin through Codex's documented
[app-server API](https://learn.chatgpt.com/docs/app-server). It does not introduce a
separate IBKR gateway login. An expired Codex or IBKR connection still needs the
owner to reconnect it; the helper never signs in, extracts credentials, grants
permissions or approves a broker action.

## One-time setup

Prerequisites: macOS, Node 20+, the FolioBuddy workspace, and Codex with its existing
IBKR plugin connected. First deploy the frontend containing this control. Then,
from the workspace root, run:

```sh
npm run ibkr:helper:setup
```

This installs an owner LaunchAgent, copies the helper runtime to the ignored
`.local/ibkr-helper/runtime`, and opens a private local page with a setup code.
Open FolioBuddy's owned IBKR section, choose **Sync IBKR**, and enter that code in
**Connect this Mac once**. The code expires after ten minutes and five invalid
attempts. **Connect and sync** pairs the browser and starts its first sync.

If Chrome asks to allow FolioBuddy access to the local network, the owner must
approve that one-time browser permission. Do not bypass a browser warning. This
app uses this permission to reach its helper at `127.0.0.1:47683`; the helper binds
to loopback and checks the exact FolioBuddy Origin and Host itself.

The pairing grants this browser access to the four fixed IBKR account reads,
not general Codex tools. It binds one IBKR cash anchor and one connector link.
The random local token is stored in this browser under that anchor; only its hash
is kept in the helper state. It is separate from broker and Clerk credentials.
The helper never receives the browser's FolioBuddy authentication token. Signing
into a different FolioBuddy portfolio cannot silently reuse another anchor.

The LaunchAgent starts at login. Re-running setup refreshes the installed runtime
and replaces the pairing, so connect the browser again. Other Macs and browser
profiles each need setup. The button does not work on a phone or when the Mac is
asleep. To remove the helper from login items and stop it:

```sh
npm run ibkr:helper:remove
```

Removal retains private backups. **IBKR sync options → Disconnect this browser**
forgets that browser's local token; it does not change the IBKR connection.

## Data flow and fail-closed behavior

1. The signed-in browser freshly verifies the owned IBKR USD cash anchor.
2. The helper checks the enabled connector and pinned link identity. It opens an
   ephemeral, read-only Codex context and calls only positions, currency balances,
   account summary and the last 90 days of executions. No AI turn is started.
3. Positions, balances and summary are read twice within three minutes, with a real
   receipt timestamp after each complete sample. Raw receipts and the normalized
   capture are saved privately. Ambiguous execution dates/sides/identities fail.
4. The existing owner-authenticated reconciliation preview checks complete totals,
   stable quantities/native averages/cash, supported identities and closing-sale
   evidence. The helper checks the exact capture, preview hash, every holding and
   currency balance, owner scope, original USD ledger and unchanged history hashes.
   A capture older than any saved sync or cash-edit timestamp is rejected, including
   a newer sync saved by another Mac between collection and preview.
5. The helper writes the checkpoint with mode 0600, fsyncs it and reads it back.
   Directories are 0700. Only after that succeeds can the browser apply the same
   preview state through the existing Serializable reconciliation transaction.
6. A separate request to the existing **restore preview** checks current records
   against the saved run's entire financial checkpoint and history hashes. Its
   returned `before` is the original checkpoint; `after` is the saved result.
   The helper verifies both and the exact source time. **No restore is applied.**
7. Only this successful readback produces **IBKR synced and verified**. Refresh
   errors, partial responses, changed records, missing access, unknown holdings,
   missing closing evidence and checkpoint/readback mismatches stop the run.
   An interrupted apply is reported as unverified, never silently retried or undone.
   Disconnecting during collection cancels the broker client; a late response cannot
   strand an active capture and block retries. Results use the checkpoint's actual
   before/after values, including currencies no longer reported by the broker.

Broker endpoints can temporarily return an updated BASE cash aggregate alongside
older currency exchange rates. A readable response is not a valid reconciliation:
the unchanged backend preview rejects it and nothing is applied. The browser can
end that rejected job, wait ten seconds and request a completely new two-sample
capture, up to three captures per click. This applies only to the exact currency
cash/BASE and cash-summary disagreement errors from a read-only preview.

Each attempt retains its own original receipts and source timestamps. A retry
requires a new job and strictly later receipt times, the same native quantities,
averages, cash and identities across all samples, and unchanged owned app financial
records before and after a retry preview. Quote refreshes do not count as edits.
The UI explains that it is waiting for currency totals to settle. A
continuing mismatch stops visibly after the third capture. No access, checkpoint,
apply or independent readback error is retried; uncertain writes always stop.
Do not alter source totals or widen validation tolerances. Manual imports and
daily agent runs retain their original stop-on-validation-error procedure.

This recovery is browser-side; an already paired Mac helper needs no reinstall or
new code. Reload FolioBuddy after deployment. Regression tests cover fresh-read
recovery, exhaustion, changed native/app records, stale/reused captures, failed job
closure and the prohibition on retrying an apply.

Daily agent sync remains governed by
[the original runbook](2026-09-30-ibkr-cash-sync.md). This button does not alter its
schedule. Both paths preserve the repaired historical native ledger and original
USD records. IBKR tools expose connection metadata, not a brokerage account number;
the helper pins the explicitly paired connector link and existing app holdings.
Changing the connector requires pairing again. New/unsupported holdings still need
an explicit app identity before the complete account sync can proceed.

Audits live at `.local/ibkr-sync/YYYY-MM-DD/button-<id>/`, outside Git. They include
both source samples, executions, capture, review, checkpoint, independent readback
and result. An incomplete run records that status without claiming success. The
source capture is never re-timestamped to make it appear fresh.

## Development and verification

- `scripts/ibkr-sync-helper/`: fixed RPC client, source parser, audit checks, HTTP
  service, one-time installer and fictional tests. Node built-ins only.
- `ibkrDirectSync.ts`: owner-session orchestration and shared in-flight status.
- `IbkrSyncButton.tsx`: one-time pairing, progress, exact changed lines and results.
- No schema change, new backend write endpoint, agent-key writes or broker writes.
- `npm run test:ibkr-helper` covers source failures, ambiguous executions,
  ownership/ledger/history guards, readable private files, Host/Origin/token checks,
  connection changes, single-flight and checkpoint-before-verify ordering.
- Frontend tests cover owner-first ordering, backup-before-apply, independent
  readback, missing access, uncertain outcomes and duplicate entry points.
- Use the real `npm run sandbox` app for full reconciliation. Its own helper port
  is 47684 and separate state directory is `.local/ibkr-helper-sandbox`. Never pair
  the real IBKR connection to fictional sandbox holdings. A test helper with
  explicitly fictional responses is the appropriate end-to-end fixture.

The documented app-server interface includes experimental methods. Unsupported
CLI versions fail with a connection error, rather than extracting credentials or
falling back to a generic command runner. Recheck direct tool capability when
upgrading Codex. The initial capability check used CLI 0.159.2.

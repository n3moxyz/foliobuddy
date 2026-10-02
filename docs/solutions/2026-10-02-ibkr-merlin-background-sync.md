# Daily IBKR sync on Merlin

The daily worker runs on the owner's Mac mini without a FolioBuddy browser tab,
native Save dialog, or chat message. It reuses the existing read-only Interactive
Brokers connector through Codex. This avoids a separate gateway and daily gateway
login. Expired connector access still requires the owner to reconnect it.

The owner explicitly authorized this new, revocable app permission. The browser
helper and general agent API have not gained background write access. The existing
one-click **Sync IBKR** control still runs on the Mac paired with that browser.

## Setup and activation

1. Deploy the additive database migration and backend before the frontend. The
   backend's signature audience defaults to `https://api.foliobuddy.xyz`; no new
   production secret or environment variable is required.
2. On Merlin, use Node 20+ and the current bundled Codex CLI with its existing IBKR
   connector. In the owned IBKR cash panel, choose **Connect Merlin** and use its
   setup command: `npm run ibkr:worker:setup -- --cash-position-id '<cash reference>'`.
   The public reference pins the intended portfolio before any broker read.
   Setup prepares the runtime, generates an Ed25519 key locally and produces
   **public enrollment JSON**; it does not enable the schedule yet.
   The private key remains on Merlin, mode `0600`, under the ignored private worker
   directory. Never paste a private key, Clerk token, broker credential or `.env`.
3. In the signed-in FolioBuddy portfolio, edit the owned **IBKR cash & debt**
   position. Under **Daily sync → Connect Merlin**, paste the public connection
   details, review the scope and select **Authorize daily IBKR sync**. This binds
   that device to the signed-in owner and that exact cash anchor. Public enrollment
   expires after 24 hours; rerun setup to refresh it without replacing the key.
4. From the same Merlin workspace, run
   `node scripts/ibkr-sync-worker/worker.mjs "$PWD" --once`. Check **Synced and
   verified**, the broker source timestamp and the private independent readback.
   Then enable the schedule with `npm run ibkr:worker:setup -- --enable`.
   Installation, an authorization
   record, or a saved database write alone does not verify the migration.
5. Only after that production rehearsal succeeds, pause the old local Codex
   heartbeat using the supported automation tool. Preserve its prompt and schedule
   for recovery. Until then the old schedule stays active.

The LaunchAgent checks once a minute, starts at login, and attempts one run per
Singapore date after 06:00. Its due check explicitly uses `Asia/Singapore`; changing
Merlin's system timezone does not change the schedule. It catches up on a missed
morning when Merlin becomes available. It must be awake, logged into its macOS user
session and able to reach Codex, IBKR and FolioBuddy. A locked screen is supported;
sleep, logout, shutdown, expired access or a network outage can stop a run. No power,
FileVault, TCC, network or broker security settings are modified by setup.

`npm run ibkr:worker:remove` stops/removes this worker's LaunchAgent and retains its
keys and private evidence. **Daily sync → Disconnect Merlin → Stop daily sync**
revokes the server permission. **Settings → IBKR daily sync** also lists active
connections and can revoke them after a cash entry moves or becomes ineligible.
Revocation takes effect for future transactions;
a transaction already committed before revocation remains in the checkpoint log.
The other Mac's browser helper remains independent. Schedule installation, updates
and removal refuse an active or unresolved worker lock instead of interrupting it.

## Authentication and write boundaries

Only public key material is enrolled through the existing Clerk owner session.
The dedicated `/api/v1/ibkr-device/` endpoints accept signed requests for six fixed
operations: status, preview, apply, readback, complete and failure. Each request
binds its device, exact HTTP method/path, body hash, audience, timestamp and random
nonce. The server enforces Ed25519, clock freshness, persisted replay protection
and the immutable owner/cash-anchor/connector grant. Production requests use HTTPS,
refuse redirects and never send browser cookies or bearer credentials.

Public enrollment signs that same intended cash reference. Another portfolio
cannot claim it, and the worker checks the locally pinned reference even on its
first run. Existing grants remain visible and revocable if the cash entry later
becomes ineligible for syncing.

Grant authorization and nonce acceptance are rechecked inside the same Serializable
transaction as reconciliation. Soft revocation touches that same grant, preventing
a previously checked signature from bypassing a completed revoke. Only one active
grant and one unfinished attempt are permitted for a cash anchor. Owner-wide active
connections and each anchor's grant history are capped at 50. Enrollment of
a new key cannot erase an unresolved earlier attempt.

The worker cannot call generic position/trade APIs, edit manual cash, add unknown
holdings, repair historical entries or restore checkpoints. The server derives
the owner, anchor and `kind: sync` from the grant, not the request body. Every
operation rechecks the anchor's ownership and IBKR status. The pinned connector
fingerprint identifies the connector/link, not an IBKR account number; exact
contract, exchange, native-currency and holding checks still determine a safe match.

## Financial validation and private evidence

The worker reuses the existing fixed broker-read client, capture normalizer and
audit checks. It reads positions, balances and account summary twice within three
minutes and records actual receipt timestamps. Recent unambiguous executions are
required to close a missing holding. It checks native stability, complete currency
and securities totals, supported identities and unchanged app records. The latest
BASE cash is authoritative, with the existing bounded FX timing allowance described
in the [cash runbook](2026-09-30-ibkr-cash-sync.md).

The server persists a preview attempt bound to its exact source, before/after
checkpoint and state hash. The worker checks every row, saves/fsyncs the private
checkpoint and reads it back before sending its checksum to apply. Apply consumes
that attempt once and atomically saves both the reconciliation and its run ID.
Original USD purchase records, native historical entries and all histories remain.

Exact canonical source and checkpoint text is stored alongside the JSON audit
columns. Prisma's JSONB transport can round a floating-point value in its last bit;
rehashing decoded JSON alone can falsely reject the original reviewed checksum.
Exact text preserves that evidence without widening financial tolerances.

A separate request checks current records against the saved checkpoint using
restore-preview semantics. It never restores anything. The worker independently
checks that response and source timestamp, saves the readback, then acknowledges
its checksum. The server checks the records again before recording success.

Evidence is under `.local/ibkr-sync/YYYY-MM-DD/worker-<id>/`, outside Git. It includes
original receipts, executions, capture, reviewed checkpoint, apply receipt,
independent readback and result. Directories are `0700`, files `0600`. Worker keys,
configuration, journal and installed runtime live in `.local/ibkr-worker`.
Never publish these files or put real holdings/account references in PRs or logs.

## Failures and recovery

The worker claims the day and takes a durable lock before work. Before sending an
apply request it durably records `applying`. A timeout, crash, incomplete apply
response, failed readback or uncertain completion blocks further automatic writes.
It does not retry an uncertain write or silently restore a checkpoint. A known
failure before applying ends that attempt; the next scheduled date may collect a
new capture. Reusing old data with a new timestamp is prohibited.

The cash panel shows the last contact, broker capture, verified run, exact native
changes and actionable failure. It reports an overdue daily sync after a one-hour
grace period even when Merlin cannot report an outage. Successful runs with unchanged
quantities, native averages and native cash balances are quiet, including FX-only
changes. Private logs retain detailed provider errors; the app shows bounded messages.

For an interrupted or blocked attempt, keep its lock/journal/checkpoints. Inspect
the saved attempt/run ID, exact before/after state, source time and histories with
the owner's authenticated review tools. **Do not delete locks, edit the journal,
rotate/re-enroll a key or clear database attempt state as an automatic repair.**
Resolving an uncertain result requires an explicit owner-reviewed recovery; there
is deliberately no generic reset or restore action exposed to the device. Revoking
the device stops it while that review happens. The browser's manual checkpoint
review remains available.

## Development and checks

- `scripts/ibkr-sync-worker/`: signed HTTP client, private identity/setup, schedule,
  durable worker and fictional Node tests. No new runtime dependencies.
- `ibkrDeviceAuth.ts` and `ibkrDeviceService.ts`: public enrollment/signature checks,
  scoped grants, replay protection and attempt orchestration.
- `IbkrBackgroundSync.tsx`: owner connection/review/revocation and daily status.
- `npm run test:ibkr-worker`: failure ordering, duplicate dates, interrupted writes,
  private evidence, signature interoperability and installer identity preservation.
- `packages/backend/scripts/verify-ibkr-device.ts`: real isolated PostgreSQL checks
  for ownership, replay, revocation, financial atomicity and immutable histories.
- `npm run sandbox`: fictional app only; `IBKR_DEVICE_AUDIENCE` is automatically set
  to its explicit loopback API. Production refuses non-production audiences.
  Never connect real broker holdings to the fictional portfolio. Use injected
  fictional broker responses for the worker end-to-end rehearsal.

The mocked demo models owner connection/revocation but never starts a worker.
Production activation and its verification must be recorded separately from test
results or merging the implementation.

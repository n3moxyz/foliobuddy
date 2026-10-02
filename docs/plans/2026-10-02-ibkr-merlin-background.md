# Daily IBKR sync on Merlin

## Approved decision

The owner approved a browser-free worker on the always-on Mac mini. Codex's local
heartbeat cannot be transferred to that host with the supported scheduling tools,
and the browser workflow can stop at a locked-screen Save dialog. Reuse the fixed
read-only IBKR connector client and reconciliation checks, and add a narrowly scoped,
revocable FolioBuddy device grant. Keep the existing heartbeat until a production
worker run is independently verified. The existing on-demand browser helper remains.

## Scope and authority

- Only an existing owned IBKR USD cash anchor and its owned IBKR holdings.
- Preserve original USD costs, the repaired native ledger, and all histories.
- No orders, conversions, transfers, broker settings, copied credentials, new broker
  permissions, generic app writes, new holdings, or automatic checkpoint restoration.
- Merlin generates an Ed25519 key locally. Only public enrollment material leaves it.
  The signed-in owner grants access in the IBKR cash panel and can revoke it there.
- The worker pins the existing connector/link fingerprint. It does not represent
  this fingerprint as an account number; contract and holding checks still apply.

## Implementation contract

Public enrollment: strict JSON `{version:1, deviceId:UUID, cashPositionId:string, name:string,
publicKey:string (SPKI DER base64), connectorFingerprint:64hex, audience:string,
createdAt:UTC ISO, signature:base64}`. Proof of possession signs the canonical JSON
of the preceding fields (excluding signature). Enrollment expires after 24 hours.
Audience defaults to `https://api.foliobuddy.xyz`; local sandbox uses an explicitly
configured loopback audience. Only Ed25519 keys are accepted. The intended cash
anchor is pinned locally before any broker read, signed in enrollment and checked
against the enrolling owner and every worker status response.

Every device request is POST to `/api/v1/ibkr-device/{operation}` with strict JSON.
Headers: `x-ibkr-device-id`, `x-ibkr-timestamp` (UTC ISO), `x-ibkr-nonce` (UUID),
`x-ibkr-signature` (base64). Sign canonical JSON of `{version:1,audience,deviceId,
method:'POST',path,timestamp,nonce,bodyHash}`; `bodyHash` is SHA256 of canonical JSON.
Canonicalization and hashing match the existing helper audit module. Accept at most
three minutes clock skew; persist unique nonces. Each authorized operation rechecks
and touches the grant inside the same Serializable transaction as its work, so
revocation serializes with writes. Derive owner, cash anchor and kind from the grant.

- Clerk owner endpoints: GET `/ibkr/devices?cashPositionId=...`, POST `/ibkr/devices`
  with `{cashPositionId,enrollment}`, DELETE `/ibkr/devices/:id`. Only one active grant
  per anchor; revocation is permanent. Omit the GET anchor to list the owner's active
  grants in Settings, even when an anchor is no longer eligible. Both active owner
  grants and each anchor's history are capped at 50. Return public status, never private material.
- `status {}` returns `{deviceId,userId,cashPositionId,connectorFingerprint,
  blocked:boolean}`. It cannot change financial records or declare verification.
- `preview {capture}` validates a fresh complete capture, rejects unfinished prior
  attempts, saves an attempt bound to the exact capture/state/backup, and returns
  `{attemptId,...reconciliationPreview}`.
- `apply {attemptId,checkpointHash}` checks the saved backup checksum and consumes
  the preview once, reconciling and recording the sync run in one transaction.
  Returns `{attemptId,...reconciliationResult}`. No retry of an uncertain apply.
- `readback {attemptId}` independently checks current saved records against that
  attempt's run, returns the existing restore-preview shape (never restore/apply),
  and saves its checksum. It does not yet mark the worker run complete.
- `complete {attemptId,readbackHash}` requires a matching independent readback,
  rechecks saved state, and marks the attempt verified. Returns `{verified:true,
  unchanged:boolean,capturedAt:string}`. Native changes drive meaningful status;
  FX-only changes remain quiet.
- `failure {attemptId?:string,stage:'broker'|'capture'|'checkpoint'|'apply'|'readback'|
  'worker'}` records a bounded, user-safe failure. An applied/readback/uncertain run
  remains blocked; a known pre-apply failure can be terminal. No success override.

Store device grants, replay nonces and attempts in additive tables. Reuse the
existing sync service through a transaction-level seam; keep its browser API stable.
Reject a capture older than any saved IBKR source timestamp on the server as well
as in the worker. Unknown fields, holdings, identities, stale captures and changed
records fail before writes.

Worker runs once per Singapore date after 06:00. A LaunchAgent ticks every minute
and on login, with an internal Asia/Singapore due check and durable process lock.
Claim the date before work. Persist a durable applying marker before the request;
an interrupted/uncertain write or readback failure blocks future writes. Save fresh
receipts, capture, reviewed checkpoint and readbacks privately beneath the workspace's
ignored `.local/ibkr-sync/YYYY-MM-DD` (directories 0700, files 0600). Keep the private
device key/config and immutable installed runtime under `.local/ibkr-worker`.
Use HTTPS production requests with no redirects and bounded response/timeout sizes.

## Delivery and validation

1. Test then implement signed owner/device APIs, schema, transaction guards.
2. Test then implement worker, crash guard, private enrollment and installer.
3. Add owner enrollment, schedule/status and disconnect UI; preserve manual sync.
4. Verify real isolated PostgreSQL replay/revocation/atomicity/history guarantees,
   fictional worker end-to-end, rendered sandbox UI, full tests/build/format gates.
5. Review security, correctness, performance and maintainability; fix findings.
6. Document install, recovery, expiry, missed schedules and activation. Deliver a
   reviewed PR. Deploy/install/owner-authorize only with required authority; retire
   the old heartbeat only after a fresh production run is saved and verified.

Acceptance: daily unattended sync without a browser or chat Send step, no duplicate
daily runs or writes after revocation, readable checkpoint before apply, independent
readback before success, visible actionable failure, no changes outside owned IBKR.
Merlin must be awake with its user session and existing IBKR access available; a
locked screen is supported, but logout/shutdown or expired access stops the worker.


## Multi-user acceptance refinement

Each signed-in user sets up their own Codex/IBKR connection and optional Mac. No
user inherits another owner's worker or local helper access. Existing signed-worker
scope remains; add fresh owner permits to the browser helper and bind connector
fingerprints persistently across both setup paths. Login changes must cancel pending
work and replace the query cache, including delayed token acquisition and A→B→A.
Setup uses “Connect a Mac” and a chosen device name, with separate macOS profiles
for different people. Verify two positive owners and crossed owner/key/anchor/job
requests, expiry/replay/concurrency, ownership changes, interrupted apply guards,
and legacy helper rejection before the authorized merge.

# One-click IBKR sync

## Decision

The owner rejected the chat handoff's extra Send step. The Mac can be on; daily
gateway sign-in remains unacceptable. Keep the existing read-only IBKR connection.

Considered: a gateway (daily authentication), Flex reports (different freshness),
background AI prompts (unnecessary model work), and direct connector calls through
Codex's documented app-server API. Choose direct calls: a local capability probe
confirmed the installed connector and fetched positions without starting a model
turn. See [App Server](https://learn.chatgpt.com/docs/app-server), including
`mcpServerStatus/list` and `mcpServer/tool/call`. The installed CLI's generated
protocol was checked; experimental API changes must fail closed.

## Design and authority

- A small Node helper runs on the owner's Mac, bound only to `127.0.0.1`.
  A one-time setup code pairs one browser origin and owned IBKR cash anchor.
  Exact Origin/Host checks, a random local token, request limits and a single active
  capture prevent arbitrary websites and duplicate clicks from starting syncs.
- Only positions, balances, summary and recent executions are allowlisted.
  Reuse Codex's authentication internally; never inspect or copy its credentials,
  start model turns, approve permission requests, or expose a generic tool proxy.
  Pin the paired connector link identity and stop if it changes.
- The signed-in browser verifies its owned cash anchor, requests two fresh reads,
  and uses the existing owner-only reconciliation preview/apply endpoints.
  The helper never receives Clerk credentials or permission to write app data.
- Automatically review the validated plan, persist/read back the private
  checkpoint locally, apply the identical preview state, and independently verify
  all financial fields, histories and source time against the saved checkpoint.
  Keep explicit manual import/restore available. Do not change cost math or history.
- Save receipts, captures, checkpoints and readbacks below the workspace's ignored
  `.local/ibkr-sync/YYYY-MM-DD`, directories 0700/files 0600. No Save dialog per run.
- Show checking, reading, saving and verifying states. Report completion only after
  independent readback. Offline helper, changed identity, expired auth, unsupported
  holdings, ambiguous executions, stale data and any mismatch stop the operation.
- Installation/pairing is separate from deployment. Browser local-network access
  may need a one-time user permission. Keep the app tab open during a sync.

## Implementation

1. Build/test fixed app-server client, capture parser and private audit writer.
2. Build/test the loopback helper and one-time macOS setup/uninstall commands.
3. Replace the handoff control with owner-checked one-click orchestration; keep the
   advanced manual capture path. Add protocol/ordering/ownership/error tests.
4. Verify fictional data end to end against the real sandbox and inspect the UI.
   Run project checks; update the runbook, AGENTS/CLAUDE and FORET.
5. Deliver reviewable code and setup instructions. Do not claim production works
   before deployment, pairing and a verified production readback.

## Acceptance

After pairing, one click updates only owned IBKR records without a chat or Send.
No broker mutation or new broker login is requested. Backups are readable before
apply; failed validation cannot apply; original USD costs and histories survive;
changed app records invalidate the preview; concurrent clicks cannot overlap;
unverified/ambiguous results never display success.

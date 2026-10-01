# On-demand IBKR sync via Codex

Status: shipped in PR #55, then superseded at the owner's request by
[one-click sync](2026-10-01-ibkr-one-click-sync.md). Keep this record of the initial
decision; the current button no longer opens a chat draft.

## Decision

The Mac will be on when the owner requests a sync, but daily IBKR gateway sign-in
is unacceptable. On 2026-10-01 the owner chose **Sync via Codex**: open the existing
connected chat with a prepared request, then press Send. The manual reconciliation
is complete; the existing daily automation stays in place.

Alternatives checked:

- Retail Client Portal Gateway requires daily sign-in and does not meet the request.
- Flex reports cannot substitute for fresh portfolio averages and cash balances.
- CLI queueing is not verified against this running desktop session. Do not claim
  an automatic handoff or extract connector credentials to provide one.
- The installed desktop route supports `codex://threads/<id>?prompt=<encoded text>`:
  it opens the existing local chat and fills the composer without sending it.

## Implementation

1. Add **Sync via Codex** beside the owned IBKR broker group and in its cash panel.
   Keep it separate from the collapse toggle. Other brokers and custody positions
   do not get the control. Reuse existing buttons, menus, dialogs and design tokens.
2. Save a validated local Codex chat ID in this browser, keyed by the owned IBKR
   cash anchor (or an owned holding when cash is absent). No private chat IDs in
   source, build configuration or server data. Provide change-link and copy-request
   actions. Invalid links and unavailable storage receive clear feedback.
3. Build a fixed prompt scoped to the owned position reference: fresh double broker
   reads, identity/completeness validation, closing-sale evidence, private checkpoint,
   owner-session apply and independent readback. Preserve USD records, all histories
   and other brokers. Never request broker mutations. Missing access stops the sync.
4. Opening Codex only opens a draft. Explain the Send step; never claim queued,
   running or successful without evidence. Show only persisted broker timestamps.
5. Rename the existing JSON action **Import broker capture**. Keep its validation
   and apply flow intact. No new backend endpoint, migration or broker credentials.

## Acceptance and verification

- Reject non-local chat URLs; discard supplied query/prompt content and rebuild the
  fixed request. Browser-local configuration stays isolated by owned anchor.
- Test scope, group-toggle behavior, settings isolation, storage/clipboard failure
  and honest handoff feedback. No changes to financial calculations.
- Inspect the real fictional sandbox at desktop, medium and mobile widths. Verify
  the destination/prefilled draft without sending a sandbox sync to the broker.
- Run frontend tests, full build and project formatting/domain checks. Update the
  runbook, AGENTS/CLAUDE and FORET. Create a feature PR; deployment and live verification
  follow explicit merge authority. This account-specific shortcut does not warrant
  a new landing-page capability tile.

## References checked on 2026-10-01

- [Codex deep links](https://learn.chatgpt.com/docs/reference/commands#deep-links)
- [Codex queue implementation](https://github.com/openai/codex/blob/main/codex-rs/tui/src/session_queue_commands.rs)
- [Gateway restrictions](https://www.interactivebrokers.com/docs/web-api/authentication/cpgw/limitations-of-the-client-portal-gateway)
- [Flex Web Service](https://www.interactivebrokers.com/docs/web-api/flex-web-service/introduction)

The installed desktop route parser/navigation handler confirms prompt support for
an existing local chat. Public documentation explicitly describes the Send step
for prefilled prompts. This is a desktop handoff, not a direct broker API.

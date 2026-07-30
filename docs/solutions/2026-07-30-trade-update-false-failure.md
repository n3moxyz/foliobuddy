# Trade Update Persists but the UI Reports Failure

## Symptom

Editing a production trade shows the global **Action failed — Request failed** toast and leaves the
dialog open. Refreshing afterward reveals that the update actually persisted and its derived P&L is
correct.

## Cause

The backend committed the idempotent `PUT /trades/:id`, but the browser received a transient
non-JSON failure from the response path. The API client converted that response to the generic
`Request failed` error, so React Query treated a successful database write as a failed mutation.

The incident happened immediately after a rolling backend deployment. A separate deployment
workflow weakness hid the rollout timing: it slept for 120 seconds and checked `/health`, which was
still being served by the previous container while Coolify continued building the new release.

## Fix

- When a trade update request fails, immediately re-read that trade.
- Treat the mutation as successful only when every field included in the attempted update matches
  the persisted record, including normalized calendar dates and tags.
- Preserve and surface the original error when the read fails or any requested field differs.
- Include the HTTP status in the fallback API error when the response body is not JSON.
- Poll the exact Coolify `deployment_uuid` to a successful terminal state before running `/health`.

This recovery is safe because the trade update is an idempotent PUT and comparison is limited to
fields the caller actually attempted to write.

## Verification

- Reproduced the original SKHY update and confirmed that `fundingCost=23000` persisted despite the
  failure toast.
- A fresh production read showed net realized P&L of `-$153,862` (`-15.28%`).
- A second identical production save completed normally.
- Frontend tests cover both the committed-response-loss recovery and the genuine mismatch failure.
- Run the full monorepo tests and builds before shipping the recovery.

# Preserve confirmed preferences during overlapping requests

## Problem

Snapshot schedules, perp exposure, and Reduce percentages share the `['user', 'preferences']` React Query row.
A slow GET can return old values after a PATCH succeeds.
A delayed PATCH for another field can also return an old copy of the percentages.
Replacing the complete cache row restores those old values, despite a successful save.

## Fix

- Cancel preference GETs before starting each save.
- Cancel preference GETs again before merging a successful response. Focus or reconnect can start a GET during the save.
- Merge only the fields that the mutation changed.
- Roll back only those fields when an optimistic save fails.
- Keep Reduce buttons unchanged until the server confirms their new values.

`useReducePercentages` owns `reducePercentages`.
`usePerpExposure` owns `perpExposureUsd`.
`useUpdateUserPreferences` merges the keys supplied to its mutation.
These rules preserve unrelated optimistic changes and confirmed saves.

## Verification

Run `npm test --workspace=@foliobuddy/frontend -- ReducePresets usePerpExposure useUserPreferences`.
The deferred-response tests complete a stale GET after a preset save.
They also finish schedule and perp saves after a newer preset update, for both success and failure.
The custom buttons must remain intact in each case.

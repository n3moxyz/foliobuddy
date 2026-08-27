# Perp Exposure Disappears Across Devices

## Symptom

A manually entered perpetual-futures exposure appears in Portfolio and the Dashboard on the device
where it was saved, but disappears after signing into the same FolioBuddy account on another
device. The Exposure KPI is then understated even though net worth remains correct.

## Cause

The value was financial user state but lived only in the browser key
`foliobuddy-perp-exposure` (with `pa-portfolio-perp-exposure` as its older migration source).
`Portfolio.tsx` wrote that unscoped localStorage key, while `Dashboard.tsx` read it independently.
Local storage neither follows an authenticated user to another device nor separates two users who
share one browser.

## Fix

- Store the aggregate USD value as nullable `User.perpExposureUsd` and expose it through the
  caller-scoped `GET/PATCH /users/me/preferences` API.
- Treat `null` as "never initialized" and `0` as an intentional cleared value. This distinction
  prevents an old browser key from resurrecting exposure after a user deletes it elsewhere.
- Make the server value authoritative. A valid positive local value may seed only a `null` server
  value; successful migration removes both local keys. It must never overwrite a non-null server
  value.
- Read and update the value through the shared React Query user-preferences cache so Portfolio and
  Dashboard cannot drift.
- Keep the product boundary intact: perp exposure changes the Exposure KPI and the Perps/Cash
  allocation treatment, but never net worth or snapshots.

## Verification

- Backend route coverage round-trips `350000`, validates non-negative finite input, and proves the
  update is scoped to the authenticated user.
- Demo API coverage patches `350000`, reads it back, then resets the nullable state to `null`.
- Frontend coverage starts with empty localStorage and a server value of `350000`, proving a second
  device renders the same exposure, plus tests the one-time legacy migration path.

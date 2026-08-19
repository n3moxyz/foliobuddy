# Clerk Development → Production Instance Switch (User Id Remap)

## Symptom

Production ran on Clerk's **Development** instance for months: every visitor saw the "Development
mode" badge, sign-in used Clerk's shared dev OAuth credentials, and the frontend API lived on a
`*.clerk.accounts.dev` host. Moving to a **Production** instance is not a key swap: Clerk never
transfers users between instances, so every person gets a brand-new `user_…` id. In FolioBuddy
`User.id` **is** the Clerk user id and Position / PositionHistory / Trade / Investor / Snapshot all
hang off it. After a naive key flip, `ensureUser` would auto-create an empty `User` row on each
person's first sign-in and their real portfolio would sit orphaned under the old id.

Two smaller failures showed up along the way:

- Coolify's env-var upsert returned `403 {"message":"Missing required permissions: write"}` —
  the `COOLIFY_API_TOKEN` GitHub secret only had `read` + `deploy`.
- The first Coolify deployment after the env change died with `exit code 255` right after
  `RUN npm run build`, with no TypeScript error in the log — the build helper was killed under
  memory pressure on the 2 GB host during `tsc`.

## Cause

- Clerk instances are isolated: settings can be cloned (Waitlist, email-code sign-in, no
  passwords, Account Portal paths), but users, SSO custom credentials, integrations and paths are
  not. Production instances also refuse Clerk's shared dev OAuth apps and refuse `localhost`.
- The schema stores the Clerk id as the primary key. Prisma's default `onUpdate` for every
  `User` relation is `Cascade`, so `UPDATE "User" SET id = …` re-keys all children in one shot;
  only `PriceHistory.updatedBy` (no FK, write-only audit column) needs an explicit update.
- Coolify token permissions are granular; env writes need `write`, deploys need `deploy`.
- The API host is small; `tsc` inside the Docker build occasionally exceeds what's free while the
  old container is still serving.

## Fix

Scripts in `packages/backend/scripts/` (pure helpers + tests in `src/lib/clerkUserRemap.ts`):

1. **`clerk-mirror-users.ts`** — reads users from the source instance (`CLERK_SOURCE_SECRET_KEY`),
   creates them on the target (`CLERK_TARGET_SECRET_KEY`) with their primary email and
   `external_id` = old id, reuses same-email users instead of duplicating, and writes
   `scripts/clerk-user-id-map.json` (gitignored). It aborts rather than writing an incomplete or
   unsafe map when a source user has no email or a same-email target has a conflicting
   `external_id`. Dry-run by default, `--apply` to create.
2. **`remap-clerk-user-ids.ts --map <map>`** — dry-run plan with per-user child counts, then
   `--apply` re-keys `User` rows in one transaction and writes an audit file;
   `--rollback <audit> --apply` replays it in reverse. Guards: refuses if any `User` FK is not
   `ON UPDATE CASCADE`, a source id has no row, or a target id already owns data; deletes an
   empty target stub first; writes the real email into `User.email`.
3. **`sync-backend-env.yml`** now upserts `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` next to
   `ADMIN_USER_IDS` from GitHub secrets (unset ones skipped) and redeploys, so no secret is ever
   typed into a dashboard.
4. `ensureUser` logs a `warn` whenever it auto-creates a `User` row — a post-cutover canary for
   an id mismatch.

Cutover order (matters — it guarantees no dev-token request can write during the switch):
DB backup → backend keys + `ADMIN_USER_IDS` via `gh secret set` + `sync-backend-env.yml`
(every API call 401s from here) → `remap-clerk-user-ids.ts --apply` against production →
Vercel `VITE_CLERK_PUBLISHABLE_KEY` = `pk_live_…` + redeploy without build cache.

Coolify: create a token with `read` + `deploy` + `write` and replace the GitHub secret. Build
kill: just re-trigger the deploy; the previous container keeps serving.

## Verification

- Rehearse on a fresh `npm run db:sync` copy first (`DATABASE_URL=postgresql://dev:dev@localhost:5433/example_portfolio_db`):
  dry-run → `--apply` → SQL check → `--rollback … --apply` → SQL check.
- After the real `--apply`, run the same SQL against production: `select id, email from "User"`
  shows only the new ids with real emails; `count(*)` of every child table filtered by the old
  ids is `0`; per-user counts under the new ids equal the dry-run plan; left-join orphan counts
  are `0`; table totals are unchanged.
- Backend logs: no `Auto-created User row` warning after users sign in; a transient
  `jwk-kid-mismatch` WebSocket error is expected only between the backend and frontend flips.
- `curl https://api.foliobuddy.xyz/health` and `https://foliobuddy.xyz/api/v1/health/db` return
  200; the sign-in page has no "Development mode" badge; the served `index-*.js` contains the
  `pk_live_` key and no full `pk_test_` key (the Clerk SDK legitimately contains the literal
  `pk_test_` prefix for its own check).
- Owner signs in via Google in a private window: Dashboard/Portfolio/Trades/Investors/History
  intact, status `Live`, admin edit of a global asset succeeds (`ADMIN_USER_IDS` is per instance).

Full runbook and rollback: `DEPLOYMENT.md` → "Auth (Clerk)".

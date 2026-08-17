# Clerk Development → Production migration — live runbook / handoff

> Working document for the migration in progress (branch `claude/clerk-auth-prod-migration-2b4f5b`,
> worktree `.claude/worktrees/clerk-auth-prod-migration-2b4f5b`). No secrets or user emails in here.
> When the migration is done, fold the durable parts into DEPLOYMENT.md / FORET.md / docs/solutions and delete this file.

## Decisions (approved 2026-08-17)

- Strategy **(b)**: pre-create the 5 users on the production instance via Backend API (`external_id` = dev id),
  then re-key `User.id` in Postgres in one transaction, then flip keys. No permanent auth-code change beyond
  a `logger.warn` on `ensureUser` auto-create.
- Remap writes the **real primary email** into `User.email` (was `<id>@clerk.user`).
- `AGENT_USER_ID` / `AGENT_API_KEY` treated as **not set** in prod (OpenClaw agent dormant) unless told otherwise.
- New Google Cloud project "FolioBuddy" for the OAuth client (own consent screen name).
- Cut over today; no separate maintenance window needed (5 friendly users). Avoid 21:00 UTC ±10 min (snapshot tick).

## State

### Done

- **P1 code** (committed on this branch, not pushed): `packages/backend/src/lib/clerkUserRemap.ts` (pure helpers),
  `packages/backend/scripts/clerk-mirror-users.ts`, `packages/backend/scripts/remap-clerk-user-ids.ts`,
  `src/__tests__/clerkUserRemap.test.ts`, `ensureUser` warn + tests, `.gitignore` (`packages/backend/scripts/clerk-*.json`).
  tsc clean (src + scripts), backend suite 262/262, prettier clean.
- **Rehearsal** on a fresh `npm run db:sync` copy: live schema has all 5 User FKs `ON UPDATE CASCADE`; synthetic remap →
  identical child counts, 0 orphans, id-independent fingerprint unchanged; real API via
  `ALLOW_LOCAL_AUTH_BYPASS=true LOCAL_AUTH_USER_ID=<newOwnerId>` returned 26 positions / 21 trades / 2 investors;
  rollback restored originals; guards (empty stub deleted, non-empty target refused, missing source refused) all proven.
  Rehearsal artifacts deleted. NOTE: local `.env` `DATABASE_URL` points at db `pa_portfolio`; docker-compose/db:sync use
  `example_portfolio_db` (created it in the running `pa-local-db` container). Pass `DATABASE_URL` explicitly for local runs.
- **P2 Clerk production instance created**: `ins_3I2EtX7ODqnA6Fg3PrdDsqCMDGA` under app `app_38h5HTkXq6GQEFDHKjZI3fj6M1K`,
  cloned from dev, domain `foliobuddy.xyz`. Waitlist access mode carried over (badge shows). Dev instance
  `ins_38h5HV8eAF1Wx8D4wo58H6TKWiy` untouched (keep forever — prod keys refuse localhost).
- **P3 DNS (Cloudflare, zone foliobuddy.xyz, all DNS-only)** — 5 of 5 added and resolving (Domain Connect auto-setup
  failed with a Cloudflare provider error; all records were added manually via the dashboard — the connected Cloudflare
  MCP has no DNS tools). No CAA records exist on the zone.
  - `clerk` → `frontend-api.clerk.services` ✅
  - `accounts` → `accounts.clerk.services` ✅
  - `clkmail` → `mail.qfd96cyv28j1.clerk.services` ✅
  - `clk._domainkey` → `dkim1.qfd96cyv28j1.clerk.services` ✅
  - `clk2._domainkey` → `dkim2.qfd96cyv28j1.clerk.services` ✅ (added 2026-08-17, resolves on 1.1.1.1)
- **P4 Clerk domain**: Domains → **Verify configuration** → DNS configuration **Verified**; SSL certificates
  (Frontend API + Account portal) moved to **Issuing** automatically (no separate deploy click). Domain badge stays
  “Pending” until certs land. Poll: reload Domains page, or `curl -sI https://clerk.foliobuddy.xyz/v1/environment`.
- **P5 cloned settings verified on prod** (read-only check): Access mode = Waitlist ✅; Email: sign-up/sign-in with
  email, verification **code** only (link unchecked) ✅; Password: “Sign-up with password” OFF, “Add password to
  account” OFF ✅; Paths = Account Portal defaults (`https://accounts.foliobuddy.xyz/sign-in|sign-up`) ✅.
  SSO connections page: GitHub + Google both present, **Setup required** (custom credentials needed);
  Google redirect URI confirmed = `https://clerk.foliobuddy.xyz/v1/oauth_callback`, scopes openid/email/profile.

### Next (in order)

1. ~~DNS + verify~~ done. Confirm certs issued (Domains page shows Frontend API + Account portal ✅, badge no longer
   Pending). If still Pending after ~30 min, re-click Verify configuration.
2. ~~Verify cloned settings~~ done (see P5).
3. **Google OAuth** (user handles secrets): console.cloud.google.com → new project “FolioBuddy” → OAuth consent screen:
   External, app name FolioBuddy, support email, **no logo**, authorized domain `foliobuddy.xyz`, default scopes →
   **Publish to In production** (non-sensitive scopes → no review). Credentials → OAuth client ID → Web application →
   Authorized JavaScript origins `https://foliobuddy.xyz`; Authorized redirect URI = value shown in Clerk prod →
   SSO connections → Google → “Use custom credentials” (expected `https://clerk.foliobuddy.xyz/v1/oauth_callback`,
   copy verbatim). Paste Client ID/Secret into Clerk, Save.
4. **GitHub OAuth App** (not GitHub App): github.com → Settings → Developer settings → OAuth Apps → New: name FolioBuddy,
   Homepage `https://foliobuddy.xyz`, callback = Clerk's shown value; generate secret; paste into Clerk prod GitHub
   connection with custom credentials.
5. **P6 mirror users** (from `packages/backend`, keys exported in the shell, never printed):
   `CLERK_SOURCE_SECRET_KEY=sk_test_… CLERK_TARGET_SECRET_KEY=sk_live_… npx tsx scripts/clerk-mirror-users.ts`
   → eyeball 5 rows → `--apply` → writes `scripts/clerk-user-id-map.json` (gitignored). Prod Users page shows 5 users.
6. **P7 rehearsal with the real map**: `npm run db:sync`, then
   `DATABASE_URL=postgresql://dev:dev@localhost:5433/example_portfolio_db npx tsx scripts/remap-clerk-user-ids.ts --map scripts/clerk-user-id-map.json`
   (dry-run) → `--apply` → check → `--rollback <audit> --apply`.
7. **P8**: owner's prod id (from the map) → new `ADMIN_USER_IDS`.
8. **Cutover** (order matters):
   - C0 fresh DB backup (`scripts/backup-db.sh daily` on the host).
   - C1 backend (user, Coolify UI): `CLERK_SECRET_KEY=sk_live_…`, `CLERK_PUBLISHABLE_KEY=pk_live_…`; then
     `gh secret set ADMIN_USER_IDS --body <ownerProdId>` + `gh workflow run sync-backend-env.yml` (upserts + deploys ~7 min).
     Window opens (all API calls 401). Rollback: restore 3 vars + redeploy.
   - C2 remap on prod (me): `DATABASE_URL=<prod> npx tsx scripts/remap-clerk-user-ids.ts --map scripts/clerk-user-id-map.json`
     dry-run → go → `--apply`. Rollback: `--rollback scripts/audit-clerk-remap-<iso>.json --apply`.
   - C3 frontend (user, Vercel): `printf "pk_live_…" | vercel env add VITE_CLERK_PUBLISHABLE_KEY production` (or dashboard),
     redeploy without build cache. Rollback: old key + redeploy.
   - C4 owner smoke: private window → no “Development mode” badge → Continue with Google → dashboard/portfolio/trades/
     investors/history intact, status “Live”; backend logs: no “Auto-created User row” warn;
     `curl https://foliobuddy.xyz/api/v1/health/db`.
   - C5 admin check (edit a global asset). C6 second account check.
9. **Docs**: DEPLOYMENT.md “Auth (Clerk)” section (instances/keys, 5 DNS records, OAuth apps + redirect URI,
   `ADMIN_USER_IDS` GitHub-secret gotcha, `AGENT_*` rows, runbook + rollback); CLAUDE.md + AGENTS.md mirrored 2–3 lines
   **and trim both under 35,000 chars** (currently 35,456 / 35,097); FORET.md bullet under “Recently completed”;
   `docs/solutions/2026-08-17-clerk-dev-to-prod-user-id-remap.md` (Symptom / Cause / Fix / Verification). Then delete this file.

## Facts verified (for the docs)

- Prisma default `onUpdate` is Cascade → `UPDATE "User" SET id=…` cascades to Position, PositionHistory, Trade, Investor,
  Snapshot; only `PriceHistory.updatedBy` (no FK, write-only audit column) needs an explicit update.
- `createUser` emails are “created verified by default”; OAuth sign-in with a matching verified email “links the OAuth
  account to the existing account and signs the user in”; Waitlist gates sign-up only.
- Clone-dev-instance does **not** copy SSO connections, Integrations, Paths. Users never transfer.
- Production keys refuse localhost → dev instance stays for local dev.
- Cloudflare CNAMEs for Clerk must be DNS-only (proxied records fail Clerk's DNS check).
- Google OAuth app must be “In production” publishing status; `openid email profile` need no Google review.

## Safety rules in force

I (Claude) never type secrets/credentials into any field or print them; the user pastes OAuth secrets into Clerk,
sets `CLERK_*` in Coolify/Vercel, runs `gh secret set`, and exports the two Clerk secret keys into the shell for the
mirror script. Confirm with the user before every dashboard Save/Continue and before `--apply` on prod.

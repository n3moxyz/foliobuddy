# Deployment

> **Public repo rule**: This file documents deployment shape and required variable names only. Real host IPs, dashboard URLs, backup bucket names, project IDs, and secret values belong in private ops notes or a password manager.

## Hosts

| Component  | Host                   | URL                        |
| ---------- | ---------------------- | -------------------------- |
| Frontend   | Static app host        | https://foliobuddy.xyz     |
| Backend    | Node API host          | https://api.foliobuddy.xyz |
| Database   | PostgreSQL             | Private network            |
| DB backups | Private object storage | Daily / weekly / monthly   |

Auto-deploys: backend via `.github/workflows/deploy-backend.yml` on push to `main` (touching `packages/backend/**`). Frontend via Vercel's GitHub integration on every push.

## Production env vars

### Vercel (frontend)

| Name                         | Value                        | Notes                                                                                                                            |
| ---------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`               | `/api/v1`                    | MUST include `/v1`. Rewrite in `vercel.json` forwards `/api/*` → `api.foliobuddy.xyz/api/*`.                                     |
| `VITE_WS_BACKEND_URL`        | `https://api.foliobuddy.xyz` | Direct — Vercel doesn't proxy WebSockets. Required: frontend warns + disables WS if missing.                                     |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_…` (set privately)  | Publishable key of the Clerk **production** instance — must match the backend's `CLERK_SECRET_KEY` instance. See "Auth (Clerk)". |
| `VITE_SENTRY_DSN`            | (optional)                   | Leave unset to disable.                                                                                                          |

### Backend host

| Name                    | Value                                          | Notes                                                                                                                                                                                                      |
| ----------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | Set privately                                  | Production PostgreSQL connection string.                                                                                                                                                                   |
| `CLERK_SECRET_KEY`      | `sk_live_…` (GitHub secret → Coolify)          | Clerk **production** instance. Synced by `sync-backend-env.yml` — edit the GitHub secret, not the Coolify UI (the next sync overwrites it).                                                                |
| `CLERK_PUBLISHABLE_KEY` | `pk_live_…` (GitHub secret → Coolify)          | Same instance as above; read by Clerk's Express middleware. Synced by `sync-backend-env.yml`.                                                                                                              |
| `ADMIN_USER_IDS`        | GitHub secret → Coolify                        | Exactly one owner Clerk user ID. The sync workflow validates it and writes the same value to `AGENT_USER_ID`; re-set it after any Clerk instance switch.                                                    |
| `AGENT_API_KEY`         | Set privately                                  | Shared read-only key for `/api/v1/agent/*`; rotate independently of Clerk.                                                                                                                                |
| `AGENT_USER_ID`         | Derived by `sync-backend-env.yml`              | Portfolio owner for the agent endpoint. Do not edit it independently; it must stay aligned with `ADMIN_USER_IDS` or agent calls can return HTTP 200 with an empty portfolio.                               |
| `ALLOWED_ORIGINS`       | `https://foliobuddy.xyz,http://localhost:4000` | Exact origin matching — no wildcards.                                                                                                                                                                      |
| `RATE_LIMIT_MAX`        | (unset → 200)                                  | Override only for load testing.                                                                                                                                                                            |
| `SENTRY_DSN`            | (optional)                                     |                                                                                                                                                                                                            |
| `NODE_ENV`              | `production`                                   | Required — gates the scheduler jobs (price/snapshot crons).                                                                                                                                                |
| `PORT`                  | `4001`                                         |                                                                                                                                                                                                            |

## Backend deploy verification (Coolify)

`.github/workflows/deploy-backend.yml` must verify the exact deployment returned by Coolify, not sleep for a fixed interval and probe `/health`. During a rolling rebuild the previous container can stay healthy for several minutes, making a plain health check a false positive. Parse the `deployment_uuid` returned by `POST /api/v1/deploy`, poll that deployment to a successful terminal state, verify its commit when Coolify returns one, and only then run the public health check. The GitHub `COOLIFY_API_TOKEN` needs `read` + `deploy` + `write` permissions — `write` is required by `sync-backend-env.yml` to upsert env vars (a read+deploy token fails with `403 Missing required permissions: write`).

Deploy ordering: when API version paths change, deploy the backend before the frontend (the frontend calls `/api/v1`).

Backend image builds run on the small API host. If a deployment fails with `exit code 255` right after `RUN npm run build` and no TypeScript error, the build helper was killed under memory pressure (`tsc`) — just re-trigger the deploy; the previous container keeps serving meanwhile.

### Backend secrets sync (`sync-backend-env.yml`)

`ADMIN_USER_IDS`, `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` live as GitHub Actions secrets and are pushed into the Coolify app by the manual workflow, which then redeploys and health-checks. `ADMIN_USER_IDS` is required and must contain exactly one owner; the workflow mirrors it into `AGENT_USER_ID`. Either Clerk key may be omitted when rotating only the other value.

```bash
gh secret set CLERK_SECRET_KEY            # interactive paste — never in shell history
gh secret set CLERK_PUBLISHABLE_KEY --body "pk_live_..."
gh secret set ADMIN_USER_IDS --body "user_xxx"
gh workflow run sync-backend-env.yml
```

The workflow's fixed sleep + `/health` can pass while Coolify is still building; confirm the new container is live before trusting it (deployment status in Coolify, or the container's `SOURCE_COMMIT`/env).

## Auth (Clerk)

One Clerk application, two instances. **Development** (`pk_test_`/`sk_test_`) is the only instance whose keys work on `localhost` — it stays forever for local dev. **Production** (`pk_live_`/`sk_live_`) serves `foliobuddy.xyz`; it was cloned from Development on 2026-08-17 and cut over on 2026-08-18. Cloning copies settings (Waitlist access mode, email-code sign-in, no passwords, Account Portal paths) but **not** users, SSO credentials, integrations or paths — those were set by hand.

### Production instance shape

- **DNS (Cloudflare, all DNS-only — proxied records fail Clerk's check)**: `clerk` → `frontend-api.clerk.services`, `accounts` → `accounts.clerk.services`, `clkmail` → `mail.<id>.clerk.services`, `clk._domainkey` → `dkim1.<id>.clerk.services`, `clk2._domainkey` → `dkim2.<id>.clerk.services`. Clerk → Configure → Domains shows the exact targets; **Verify configuration** then issues certificates automatically (Frontend API + Account portal). Domain Connect auto-setup failed against Cloudflare; add the five CNAMEs manually.
- **Frontend API**: `https://clerk.foliobuddy.xyz` (JWKS kid = production instance id; a `jwk-kid-mismatch` error in backend logs means a client is still sending dev-instance tokens).
- **SSO**: Google (GCP project "FolioBuddy", OAuth client type Web, JS origin `https://foliobuddy.xyz`, consent screen published to _In production_, no logo, scopes `openid email profile`) and GitHub (OAuth App "FolioBuddy", homepage `https://foliobuddy.xyz`). Both use the redirect/callback URI Clerk shows on the connection page: `https://clerk.foliobuddy.xyz/v1/oauth_callback`. Client secrets live only in Clerk.
- **Keys**: publishable key in Vercel (`VITE_CLERK_PUBLISHABLE_KEY`) and Coolify (`CLERK_PUBLISHABLE_KEY`); secret key in Coolify (`CLERK_SECRET_KEY`) — both backend values via GitHub secrets + `sync-backend-env.yml` (see above). Publishable keys are public; secret keys are never pasted anywhere but `gh secret set`.

### Switching instances (dev → prod runbook)

`User.id` **is** the Clerk user id and every user table cascades from it, so a new instance means new ids for the same people. `ensureUser` would otherwise auto-create empty rows on first sign-in while the real data sits under the old ids. The scripts in `packages/backend/scripts/` handle it:

1. `CLERK_SOURCE_SECRET_KEY=… CLERK_TARGET_SECRET_KEY=… npx tsx scripts/clerk-mirror-users.ts` — dry-run table of source users; `--apply` creates them on the target (primary email, `external_id` = old id) and writes `scripts/clerk-user-id-map.json` (gitignored). Existing target users with the same email are reused, never duplicated.
2. Rehearse on a fresh `npm run db:sync` copy: `DATABASE_URL=postgresql://dev:dev@localhost:5433/example_portfolio_db npx tsx scripts/remap-clerk-user-ids.ts --map scripts/clerk-user-id-map.json` (dry-run) → `--apply` → `--rollback scripts/audit-clerk-remap-<iso>.json --apply`. The script refuses to run if any `User` FK is not `ON UPDATE CASCADE`, a source id is missing, or a target id already has data; an empty target stub (premature sign-in) is deleted first. It writes the real email into `User.email` (was `<id>@clerk.user`).
3. Take a DB backup, then cut over in this order so no dev-token request can write during the switch: **backend keys** (`gh secret set` + `sync-backend-env.yml`; every API call 401s from here) → **DB remap** on production (`DATABASE_URL=<prod> … --apply`, then verify: 0 rows under old ids, child counts unchanged, 0 orphans) → **frontend key** in Vercel + redeploy **without** build cache → sign in via Google in a private window, check data, `Live` badge, no `Auto-created User row` warning in backend logs.
4. `ADMIN_USER_IDS` must be the owner's **new** id (it's a GitHub secret — set it in the same sync run). The workflow writes that same value to `AGENT_USER_ID` so the admin and agent portfolio owner cannot drift.

Rollback is per layer and independent: restore the three backend secrets + re-run the sync; `remap-clerk-user-ids.ts --rollback <audit> --apply`; restore the Vercel key + redeploy.

## Post-deploy smoke check

```bash
# 1. Backend health
curl https://api.foliobuddy.xyz/health
# → {"status":"ok","timestamp":"..."}

# 2. Full chain via Vercel rewrite — this is what actually breaks when VITE_API_URL drifts
curl https://foliobuddy.xyz/api/v1/health/db
# → {"status":"healthy",...}

# 3. Visit https://foliobuddy.xyz/ — confirm:
#    - Status badge shows "Live" (not "Offline") — WebSocket connected
#    - Dashboard renders data (not "No data for YTD period")
```

If (2) returns 404, check the frontend host's `VITE_API_URL` value and redeploy after changing it.

## Env var change workflow

Drift between host env vars and what the code expects caused an outage on 2026-04-19. To change a prod env var:

1. Update this file if the required variable name or expected shape changed.
2. Update the deployment provider dashboard to match — except the backend vars listed under "Backend secrets sync", which are GitHub secrets: `gh secret set …` then `gh workflow run sync-backend-env.yml` (that run also redeploys).
3. Redeploy (`vercel deploy --prod` or push to `main`).
4. Run the smoke check above.

When rotating the owner's Clerk identity, update `ADMIN_USER_IDS` and
`AGENT_USER_ID` together. The manual `sync-backend-env.yml` workflow uses the
single-ID `ADMIN_USER_IDS` GitHub secret for both mappings and rejects a
comma-separated value. A valid `AGENT_API_KEY` with a stale `AGENT_USER_ID`
authenticates successfully but returns an empty portfolio, so verify the agent
endpoint has a non-zero position count after the redeploy.

When adding/removing values via `vercel env add`, pipe the value through `printf` (not `echo`) to avoid a trailing newline:

```bash
# Good
printf "https://api.foliobuddy.xyz" | vercel env add VITE_WS_BACKEND_URL production

# Bad — stores "\n" which is truthy but malformed
echo "https://api.foliobuddy.xyz" | vercel env add VITE_WS_BACKEND_URL production
```

## DB backups

On the backend host: `./scripts/backup-db.sh daily|weekly|monthly` and `./scripts/restore-db.sh [path]`. Rotations land in private object storage (bucket names in private ops notes).

## Monitoring

- **Vercel build failures**: Project → Settings → Git → enable "deployment failure" notifications to Slack/email. Without this, failed frontend builds silently keep the old bundle live.
- **Uptime**: external monitor (UptimeRobot / BetterStack free tier) hitting `https://foliobuddy.xyz/api/v1/health/db` every 5 min. Hitting that URL (not `api.foliobuddy.xyz` direct) tests the full chain: Vercel edge → rewrite → backend → DB.
- **Uptime (workflow)**: `.github/workflows/uptime.yml` hits `/api/v1/health/db` every 10 min; non-200 emails the owner.
- **Sentry**: configured via `SENTRY_DSN`. Backend captures unexpected 500s only; Zod 400s and `AppError`s < 500 are skipped on purpose.

## Incident postmortems

- `docs/solutions/` — historical fixes and lessons, written when a non-trivial bug is resolved.

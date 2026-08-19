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

| Name                         | Value                        | Notes                                                                                        |
| ---------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------- |
| `VITE_API_URL`               | `/api/v1`                    | MUST include `/v1`. Rewrite in `vercel.json` forwards `/api/*` → `api.foliobuddy.xyz/api/*`. |
| `VITE_WS_BACKEND_URL`        | `https://api.foliobuddy.xyz` | Direct — Vercel doesn't proxy WebSockets. Required: frontend warns + disables WS if missing. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Set privately                | Use the publishable key for the same Clerk instance as the backend secret key.               |
| `VITE_SENTRY_DSN`            | (optional)                   | Leave unset to disable.                                                                      |

### Backend host

| Name               | Value                                          | Notes                                                                                                                      |
| ------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`     | Set privately                                  | Production PostgreSQL connection string.                                                                                   |
| `CLERK_SECRET_KEY` | Set privately                                  | Must match frontend's publishable key instance.                                                                            |
| `ADMIN_USER_IDS`   | Set privately                                  | Comma-separated Clerk user IDs allowed to edit/delete global Asset catalog records. Unset → no one passes the admin guard. |
| `AGENT_API_KEY`    | Set privately                                  | Shared read-only key for `/api/v1/agent/*`; rotate independently of Clerk.                                                 |
| `AGENT_USER_ID`    | Set privately                                  | Exactly one Clerk user ID whose portfolio the agent endpoint reads. Must track owner identity rotations.                   |
| `ALLOWED_ORIGINS`  | `https://foliobuddy.xyz,http://localhost:4000` | Exact origin matching — no wildcards.                                                                                      |
| `RATE_LIMIT_MAX`   | (unset → 200)                                  | Override only for load testing.                                                                                            |
| `SENTRY_DSN`       | (optional)                                     |                                                                                                                            |
| `NODE_ENV`         | `production`                                   | Required — gates the scheduler jobs (price/snapshot crons).                                                                |
| `PORT`             | `4001`                                         |                                                                                                                            |

## Backend deploy verification (Coolify)

`.github/workflows/deploy-backend.yml` must verify the exact deployment returned by Coolify, not sleep for a fixed interval and probe `/health`. During a rolling rebuild the previous container can stay healthy for several minutes, making a plain health check a false positive. Parse the `deployment_uuid` returned by `POST /api/v1/deploy`, poll that deployment to a successful terminal state, verify its commit when Coolify returns one, and only then run the public health check. The GitHub `COOLIFY_API_TOKEN` needs both `read` and `deploy` permissions.

Deploy ordering: when API version paths change, deploy the backend before the frontend (the frontend calls `/api/v1`).

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
2. Update the deployment provider dashboard to match.
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

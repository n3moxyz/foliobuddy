# Deployment

> **Public repo rule**: This file documents deployment shape and required variable names only. Real host IPs, dashboard URLs, backup bucket names, project IDs, and secret values belong in private ops notes or a password manager.

## Hosts

| Component | Host | URL |
|---|---|---|
| Frontend | Static app host | https://foliobuddy.xyz |
| Backend  | Node API host | https://api.foliobuddy.xyz |
| Database | PostgreSQL | Private network |
| DB backups | Private object storage | Daily / weekly / monthly |

Auto-deploys: backend via `.github/workflows/deploy-backend.yml` on push to `main` (touching `packages/backend/**`). Frontend via Vercel's GitHub integration on every push.

## Production env vars

### Vercel (frontend)

| Name | Value | Notes |
|---|---|---|
| `VITE_API_URL` | `/api/v1` | MUST include `/v1`. Rewrite in `vercel.json` forwards `/api/*` → `api.foliobuddy.xyz/api/*`. |
| `VITE_WS_BACKEND_URL` | `https://api.foliobuddy.xyz` | Direct — Vercel doesn't proxy WebSockets. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Set privately | Use the publishable key for the same Clerk instance as the backend secret key. |
| `VITE_SENTRY_DSN` | (optional) | Leave unset to disable. |

### Backend host

| Name | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Set privately | Production PostgreSQL connection string. |
| `CLERK_SECRET_KEY` | Set privately | Must match frontend's publishable key instance. |
| `ADMIN_USER_IDS` | Set privately | Comma-separated Clerk user IDs allowed to edit/delete global Asset catalog records. Unset → no one passes the admin guard. |
| `ALLOWED_ORIGINS` | `https://foliobuddy.xyz,http://localhost:4000` | Exact origin matching — no wildcards. |
| `RATE_LIMIT_MAX` | (unset → 200) | Override only for load testing. |
| `SENTRY_DSN` | (optional) | |
| `NODE_ENV` | `production` | Required — gates the scheduler jobs (price/snapshot crons). |
| `PORT` | `4001` | |

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

When adding/removing values via `vercel env add`, pipe the value through `printf` (not `echo`) to avoid a trailing newline:

```bash
# Good
printf "https://api.foliobuddy.xyz" | vercel env add VITE_WS_BACKEND_URL production

# Bad — stores "\n" which is truthy but malformed
echo "https://api.foliobuddy.xyz" | vercel env add VITE_WS_BACKEND_URL production
```

## Monitoring

- **Vercel build failures**: Project → Settings → Git → enable "deployment failure" notifications to Slack/email. Without this, failed frontend builds silently keep the old bundle live.
- **Uptime**: external monitor (UptimeRobot / BetterStack free tier) hitting `https://foliobuddy.xyz/api/v1/health/db` every 5 min. Hitting that URL (not `api.foliobuddy.xyz` direct) tests the full chain: Vercel edge → rewrite → backend → DB.
- **Sentry**: configured via `SENTRY_DSN`. Backend captures unexpected 500s only; Zod 400s and `AppError`s < 500 are skipped on purpose.

## Incident postmortems

- `docs/solutions/` — historical fixes and lessons, written when a non-trivial bug is resolved.

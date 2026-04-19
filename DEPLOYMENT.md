# Deployment

> **Rule**: When production env vars change, update this file in the same commit. Drift between what's documented here and what's in the Vercel/Coolify dashboards is how prod breaks.

## Hosts

| Component | Host | URL |
|---|---|---|
| Frontend | Vercel (`foliobuddy` project, `n3mos-projects` team) | https://foliobuddy.xyz |
| Backend  | Coolify on DigitalOcean | https://api.foliobuddy.xyz |
| Database | Self-hosted Postgres 17 on DO via Coolify | `203.0.113.10:5432` |
| DB backups | DO Spaces (`example-backup-bucket`) | Daily / weekly / monthly |

Auto-deploys: backend via `.github/workflows/deploy-backend.yml` on push to `main` (touching `packages/backend/**`). Frontend via Vercel's GitHub integration on every push.

## Production env vars

### Vercel (frontend)

| Name | Value | Notes |
|---|---|---|
| `VITE_API_URL` | `/api/v1` | MUST include `/v1`. Rewrite in `vercel.json` forwards `/api/*` → `api.foliobuddy.xyz/api/*`. |
| `VITE_WS_BACKEND_URL` | `https://api.foliobuddy.xyz` | Direct — Vercel doesn't proxy WebSockets. |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_...` | Use live keys, not `pk_test_...`. Must match backend's `CLERK_SECRET_KEY` instance. |
| `VITE_SENTRY_DSN` | (optional) | Leave unset to disable. |

### Coolify (backend)

| Name | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://...` | Prod DB. |
| `CLERK_SECRET_KEY` | `sk_live_...` | Must match frontend's publishable key instance. |
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

If (2) returns 404, `VITE_API_URL` in Vercel is stale — run `vercel env ls production` to inspect.

## Env var change workflow

Drift between dashboard env vars and what the code expects caused an outage on 2026-04-19. To change a prod env var:

1. Update `DEPLOYMENT.md` (this file) first, in a commit.
2. Update the Vercel / Coolify dashboard to match.
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

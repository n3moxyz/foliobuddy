# Testing Without Signing In

Every real FolioBuddy page sits behind a Clerk sign-in, and an agent must never type the owner's password into the live site. These three paths cover everything without one, from any session, with nothing to approve each time.

| Path                                   | What runs                                                                    | Use it for                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Sandbox**: `npm run sandbox`         | The real web app, API and Postgres on this machine, signed in as a test user | Any change: UI, API, database, news                                 |
| **Dev demo**: `/dev/demo`              | The web app only; every API call is answered by mocks                        | Quick UI looks when the server doesn't matter                       |
| **Production check**: `prod-check.yml` | GitHub Actions against the live site                                         | Did a deploy work? Is X collection running? Does the feed serve it? |

Think of the sandbox as a flight simulator: the real cockpit and real controls, but the passengers are made up. The dev demo is a cardboard cockpit for checking where the buttons sit. The production check is the pre-flight walkaround on the real plane, done by a checklist instead of a pilot's key.

## Sandbox

```bash
npm run sandbox              # → http://localhost:4100, already signed in
npm run sandbox -- --reset   # rebuild the sample data first
```

In the Claude desktop app, `preview_start` with the `sandbox` configuration (`.claude/launch.json`) does the same and opens the browser pane. The first run in a fresh checkout installs dependencies, which takes a minute or two.

- **Real:** the frontend and API from your working copy (edits reload live), a Postgres database built by the real migrations, and live price and news providers (CoinGecko, Yahoo, Google News).
- **Sample:** a portfolio of real public tickers with invented amounts, open and closed trades, 400 days of snapshots ending today, an investor split, and X posts from fictional `fbsandbox_*` accounts. There is one account per roster role, and the posts are shaped to hit the ranking rules: anchors and important posts reach the feed, while radar posts, questions and cashtag baskets stay on holding pages.
- **No browser needed:** `curl http://localhost:4101/api/v1/news` works without an auth header. The agent routes take `x-api-key: sandbox-agent-key`.
- **Data lifecycle:** the portfolio survives restarts, so what you change persists. Snapshots rebuild when they no longer reach today, and X posts are re-dated on every start. `--reset` starts over.
- **Database:** a local PostgreSQL on port 5432 that trusts your OS user (Homebrew, Postgres.app); otherwise the Docker one from `docker-compose.yml` on 5433. Only the `foliobuddy_local_sandbox` database is ever touched: the seed and the API refuse any other database name and any non-local host.
- **Sealed off:** Anthropic, twitterapi.io and Sentry stay off even when `packages/backend/.env` holds keys for them, and Clerk gets inert placeholder keys. The sign-in bypass (`ALLOW_LOCAL_AUTH_BYPASS` / `VITE_LOCAL_AUTH_BYPASS`) is ignored by production builds.
- **Ports:** 4100 (web) and 4101 (API). `SANDBOX_PORT=4200 npm run sandbox` moves both.
- **New feature, new data:** add it to `packages/backend/src/scripts/sandbox/fixtures.ts`. `src/__tests__/sandbox.test.ts` fails if a sample X post stops matching a holding.

## Dev demo

`/dev/demo` on the plain Vite dev server (`preview_start` `frontend-demo`, port 4000) renders every page from mocks in `packages/frontend/src/dev/demoMode.tsx`. It needs no backend at all, but it only knows what its mocks were taught, so a server or database change never shows up there. The rules for editing it are in CLAUDE.md ("Dev Demo Route").

## Production check

`.github/workflows/prod-check.yml` checks the signed-in parts of the live site:

1. The agent portfolio loads.
2. X posts are being collected. The newest post must be under 6 hours old; the roster posts about 120 times a day.
3. The collector's own log lines: started, paused, out of credits.
4. The News feed serves X posts, and so does the busiest holding's page.

It runs by itself after every successful **Deploy Backend** or **Sync Backend Env to Coolify** run, daily at 09:17 Singapore time, and on pull requests that change it. A failed scheduled run emails the owner, which is how a stalled collector (for example, out of twitterapi.io credits) gets noticed.

```bash
gh run list --workflow prod-check.yml --limit 5   # latest results
gh run view <run-id> --log                        # details
gh workflow run prod-check.yml                    # run it now
```

It gets in without a sign-in the way `repair-agent-portfolio-owner.yml` does: it reads `DATABASE_URL` and `AGENT_API_KEY` from Coolify at run time and masks them. The `/api/v1/agent/*` routes (`portfolio`, `news`, `news/asset/:assetId`) accept that key in place of a Clerk session. Actions logs are public for this repo, so every step prints counts and ages only: no handles, post text, holdings, values or secrets.

To let an agent start runs without a permission prompt, add `Bash(gh workflow run prod-check.yml)` to the `permissions.allow` list in your Claude Code settings. Reading results needs no rule.

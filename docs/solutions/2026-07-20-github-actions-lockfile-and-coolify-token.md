# GitHub Actions Lockfile and Coolify Token Failures

## Symptom

Two push workflows fail almost immediately:

- CI stops in `npm ci` with `package.json and package-lock.json are not in sync` and missing
  optional peer packages such as `@emnapi/core` / `@emnapi/runtime`.
- Deploy Backend stops before the rebuild with Coolify returning HTTP 401
  `{"message":"Unauthenticated."}`.

Neither failure reaches application type-checking, tests, image building, migrations, or startup.

## Cause

The root lockfile was regenerated with npm 11 while CI used the npm 10.8.2 bundled with Node 20.
Their peer-dependency metadata differed enough that npm 10 rejected the npm 11 lockfile. The
Coolify failure was separate: the repository's `COOLIFY_API_TOKEN` secret contained a token that
the Coolify API no longer accepted.

## Fix

- Pin the repository package-manager contract to `npm@10.8.2` in `package.json`.
- Regenerate `package-lock.json` with npm 10.8.2 and verify `npm ci` in a clean directory.
- Create a fresh Coolify API token with `read` + `deploy` permissions, replace the GitHub Actions
  `COOLIFY_API_TOKEN` repository secret, and rerun the failed backend deployment.

Never print, commit, or paste the token anywhere except Coolify's token creation flow and GitHub's
encrypted secret form.

## Verification

After any dependency change, validate both the developer checks and CI's clean-install boundary:

```bash
npm ci
npm test
npm run build
npm run format:check
npm ls --workspaces --depth=0
```

For deployment recovery, the GitHub job must receive HTTP 200 from `POST /api/v1/deploy`, parse the
returned `deployment_uuid`, and poll `GET /api/v1/deployments/:uuid` until that exact deployment
finishes successfully. Only then should it check backend `/health`.

A fixed sleep followed by `/health` is not sufficient: Coolify keeps the previous container serving
during a rolling rebuild. The old release can remain healthy for minutes and make CI green while
the requested deployment is still building or about to fail.

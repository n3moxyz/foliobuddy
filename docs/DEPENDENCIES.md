# Dependency & Lockfile Maintenance

Relocated from `CLAUDE.md` (kept there as a Gotchas pointer). Update this file when any of these rules change.

## Lockfile ownership (npm 10.8.2)

The root lockfile is owned by **npm 10.8.2** (declared in `package.json`, matching Node 20 CI). Regenerate `package-lock.json` with that npm version and verify a clean `npm ci` after dependency changes. npm 11 can rewrite optional-peer metadata into a lockfile that npm 10 rejects (seen with `@emnapi/core` / `@emnapi/runtime`).

## Security override: exceljs → uuid

Root `package.json` overrides `exceljs`'s transitive `uuid` to `11.1.1` (ExcelJS 4.4 declares `uuid@^8.3.0`, flagged by `GHSA-w5hq-g745-h8pq`; ExcelJS only uses `v4()`). Do not run `npm audit fix --force` — it downgrades ExcelJS to 3.4.0. Keep `npm audit` clean (0 vulnerabilities at root).

## ExcelJS worksheet naming

ExcelJS treats the worksheet name `History` as protected; exports use `Snapshots` instead. Keep `export.test.ts` coverage for this.

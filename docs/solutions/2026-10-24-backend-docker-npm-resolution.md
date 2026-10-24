# Backend Docker dependency installation

## Failure

The backend deployment stopped during `npm install` in both Docker stages:

```text
Cannot read properties of null (reading 'edgesOut')
```

The existing backend continued to run. The replacement never reached app startup.

## Cause and repair

The backend Docker context contains only `packages/backend`. It does not use the
root workspace lockfile. npm 10.8.2 crashed while resolving that dependency graph.
The npm project tracks this failure in [issue 9787](https://github.com/npm/cli/issues/9787).

Pin npm 11.19.1 in both Docker stages. Keep the root workspace on npm 10.8.2.
Do not regenerate the root lockfile with the Docker installer version.

CI now builds the standalone backend image. Workspace type checks and tests alone
cannot catch failures in this separate installation path.

## Verification

Build with the same context that Coolify uses:

```bash
docker build --tag foliobuddy-backend:check packages/backend
```

Check both dependency installations, Prisma generation, and TypeScript compilation.
After deployment, verify the exact deployment commit and the full database health route.
Do not close an existing database connection route until its replacement works.

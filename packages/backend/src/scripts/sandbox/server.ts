import { applySandboxEnv, assertSandboxDatabase } from './config.js';

/**
 * API entry for the local sandbox (`npm run sandbox`): the real server on the
 * sandbox database, signed in through the local auth bypass as the sandbox
 * user. The server reads its configuration while loading, so it is imported
 * only after the sandbox settings are in place.
 */
assertSandboxDatabase();
applySandboxEnv(process.env, process.env.SANDBOX_WEB_ORIGIN ?? 'http://localhost:4100');

import('../../index.js').catch((error: unknown) => {
  console.error('[sandbox] API failed to start:', error);
  process.exit(1);
});

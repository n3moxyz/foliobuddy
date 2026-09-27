/**
 * The local sandbox (`npm run sandbox`): the real app on sample data, signed
 * in through the local auth bypass, so any change can be tested without a
 * Clerk account. Shared by the sandbox seed and its API entry.
 */

export const SANDBOX_USER_ID = 'sandbox-user';
// scripts/sandbox.mjs creates this database; keep the two names in sync.
export const SANDBOX_DATABASE_NAME = 'foliobuddy_local_sandbox';
/** Local-only value for trying /api/v1/agent/* in the sandbox. Not a secret. */
export const SANDBOX_AGENT_API_KEY = 'sandbox-agent-key';

/**
 * The fictional X accounts the sample posts come from, one per roster role.
 * Never real handles: this repo is public and the real roster is secret.
 */
export const SANDBOX_X_ROSTER = [
  'fbsandbox_desk:anchor_source',
  'fbsandbox_chain:anchor_when_source_backed',
  'fbsandbox_macro:corroboration_source',
  'fbsandbox_radar:radar_only',
].join(',');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

// clerkMiddleware needs well-formed keys even though the bypass signs every
// request in. These decode to a reserved .invalid host: no real instance.
const PLACEHOLDER_CLERK_PUBLISHABLE_KEY = `pk_test_${Buffer.from('sandbox.clerk.invalid$').toString('base64')}`;
const PLACEHOLDER_CLERK_SECRET_KEY = 'sk_test_sandbox_placeholder';

/** Throws unless the environment points at the local sandbox database. */
export function assertSandboxDatabase(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('The sandbox never runs with NODE_ENV=production.');
  }
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required (npm run sandbox sets it).');

  let url: URL;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!LOCAL_HOSTS.has(host) || name !== SANDBOX_DATABASE_NAME) {
    throw new Error(
      `Refusing to use ${host}/${name}: the sandbox only touches the local ${SANDBOX_DATABASE_NAME} database.`
    );
  }
}

/**
 * Configures the API for the sandbox. Set before the server loads, these win
 * over a developer's packages/backend/.env (dotenv never overrides): services
 * that bill or report — Anthropic, twitterapi.io, Sentry — stay off.
 */
export function applySandboxEnv(env: NodeJS.ProcessEnv, webOrigin: string): void {
  Object.assign(env, {
    NODE_ENV: 'development',
    ALLOW_LOCAL_AUTH_BYPASS: 'true',
    LOCAL_AUTH_USER_ID: SANDBOX_USER_ID,
    // The sandbox user can also try the admin-only catalog edits and the agent routes.
    ADMIN_USER_IDS: SANDBOX_USER_ID,
    AGENT_USER_ID: SANDBOX_USER_ID,
    AGENT_API_KEY: SANDBOX_AGENT_API_KEY,
    ALLOWED_ORIGINS: webOrigin,
    CLERK_PUBLISHABLE_KEY: PLACEHOLDER_CLERK_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: PLACEHOLDER_CLERK_SECRET_KEY,
    X_NEWS_SOURCES: SANDBOX_X_ROSTER,
    RATE_LIMIT_MAX: '10000',
    ANTHROPIC_API_KEY: '',
    TWITTERAPI_IO_KEY: '',
    SENTRY_DSN: '',
  });
}

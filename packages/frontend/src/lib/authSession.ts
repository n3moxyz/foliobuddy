export class AuthSessionChangedError extends Error {
  constructor() {
    super('The signed-in account changed. Start a new operation from the current account.');
    this.name = 'AuthSessionChangedError';
  }
}

export interface AuthSession {
  readonly ownerId: string;
  readonly sessionId: string;
  readonly mode: 'clerk' | 'local';
  readonly generation: number;
  readonly signal: AbortSignal;
  getToken: () => Promise<string | null>;
}

let generation = 0;
let controller = new AbortController();
// Public/test callers can make unauthenticated requests. Authenticated route
// children mount only after an explicit Clerk, sandbox or demo context exists.
let current: AuthSession = {
  ownerId: 'anonymous',
  sessionId: 'anonymous',
  mode: 'local',
  generation,
  signal: controller.signal,
  getToken: async () => null,
};

export function captureAuthSession(): AuthSession {
  return current;
}

export function isAuthSessionCurrent(session: AuthSession) {
  return current === session && !session.signal.aborted;
}

export function assertAuthSession(session: AuthSession) {
  if (!isAuthSessionCurrent(session)) throw new AuthSessionChangedError();
}

/** The SDK's active token can change before React commits the new account. */
export function assertAuthSessionToken(session: AuthSession, token: string | null) {
  assertAuthSession(session);
  if (session.mode === 'local') return;
  try {
    const parts = token?.split('.');
    if (parts?.length !== 3) throw new Error('Missing session token');
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    if (claims?.sub !== session.ownerId || claims?.sid !== session.sessionId)
      throw new Error('Different session token');
  } catch {
    throw new AuthSessionChangedError();
  }
}

export function installAuthSession(
  ownerId: string,
  sessionId: string,
  getToken: AuthSession['getToken'],
  mode: AuthSession['mode'] = 'clerk'
): AuthSession {
  const previous = controller;
  controller = new AbortController();
  current = {
    ownerId,
    sessionId,
    mode,
    getToken,
    generation: ++generation,
    signal: controller.signal,
  };
  previous.abort(new AuthSessionChangedError());
  return current;
}

export function endAuthSession(session: AuthSession) {
  if (current !== session) return;
  installAuthSession('anonymous', 'anonymous', async () => null, 'local');
}

/** Token refresh within one identity does not invalidate that identity's work. */
export function setSessionTokenGetter(getToken: AuthSession['getToken']) {
  current.getToken = getToken;
}

export function combinedSignal(...signals: Array<AbortSignal | null | undefined>) {
  const sources = signals.filter((signal): signal is AbortSignal => !!signal);
  const abort = new AbortController();
  const forward = (event: Event) => abort.abort((event.target as AbortSignal).reason);
  for (const source of sources) {
    if (source.aborted) abort.abort(source.reason);
    else source.addEventListener('abort', forward, { once: true });
  }
  return {
    signal: abort.signal,
    dispose: () => sources.forEach((source) => source.removeEventListener('abort', forward)),
  };
}

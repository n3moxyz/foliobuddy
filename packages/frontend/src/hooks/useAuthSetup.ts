import { useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import {
  endAuthSession,
  installAuthSession,
  isAuthSessionCurrent,
  setSessionTokenGetter,
  type AuthSession,
} from '@/lib/authSession';

/**
 * Hook to set up authentication for API requests.
 * Call this once in your app when the user is authenticated.
 */
export function useAuthSetup() {
  const { getToken, userId, sessionId } = useAuth();
  return useSessionSetup(userId ?? null, sessionId ?? null, getToken, 'clerk');
}

const noToken = async () => null;
export function useLocalAuthBypassSetup(identity = 'sandbox-user') {
  return useSessionSetup(identity, identity, noToken, 'local');
}

function useSessionSetup(
  ownerId: string | null,
  sessionId: string | null,
  getToken: AuthSession['getToken'],
  mode: AuthSession['mode']
) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const tokenGetter = useRef(getToken);
  useLayoutEffect(() => {
    tokenGetter.current = getToken;
    if (
      session?.ownerId === ownerId &&
      session.sessionId === sessionId &&
      isAuthSessionCurrent(session)
    )
      setSessionTokenGetter(getToken);
  }, [getToken, ownerId, sessionId, session]);
  useLayoutEffect(() => {
    if (!ownerId || !sessionId) return;
    const installed = installAuthSession(ownerId, sessionId, tokenGetter.current, mode);
    setSession(installed);
    return () => endAuthSession(installed);
  }, [ownerId, sessionId, mode]);
  return session &&
    session.ownerId === ownerId &&
    session.sessionId === sessionId &&
    isAuthSessionCurrent(session)
    ? session
    : null;
}

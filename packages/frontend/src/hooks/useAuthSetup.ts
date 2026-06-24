import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { setTokenGetter } from '@/lib/api';

/**
 * Hook to set up authentication for API requests.
 * Call this once in your app when the user is authenticated.
 */
export function useAuthSetup() {
  const { getToken } = useAuth();

  useEffect(() => {
    setTokenGetter(getToken);
  }, [getToken]);
}

export function useLocalAuthBypassSetup() {
  useEffect(() => {
    setTokenGetter(async () => null);
  }, []);
}

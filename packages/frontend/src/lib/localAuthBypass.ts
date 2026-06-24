type LocalAuthEnv = {
  DEV?: boolean;
  VITE_LOCAL_AUTH_BYPASS?: string;
};

export function isLocalAuthBypassEnabled(env: LocalAuthEnv = import.meta.env): boolean {
  return env.DEV === true && env.VITE_LOCAL_AUTH_BYPASS === 'true';
}

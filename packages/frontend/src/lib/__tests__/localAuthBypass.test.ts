import { describe, expect, it } from 'vitest';
import { isLocalAuthBypassEnabled } from '../localAuthBypass';

describe('isLocalAuthBypassEnabled', () => {
  it('requires dev mode and the explicit bypass flag', () => {
    expect(isLocalAuthBypassEnabled({ DEV: true, VITE_LOCAL_AUTH_BYPASS: 'true' })).toBe(true);
    expect(isLocalAuthBypassEnabled({ DEV: true, VITE_LOCAL_AUTH_BYPASS: 'false' })).toBe(false);
    expect(isLocalAuthBypassEnabled({ DEV: false, VITE_LOCAL_AUTH_BYPASS: 'true' })).toBe(false);
  });
});

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useMoneyFormatter } from '../useMoneyFormatter';
import {
  MASKED_MONEY_VALUE,
  PRIVACY_VALUES_HIDDEN_KEY,
  usePrivacyStore,
} from '@/stores/privacyStore';

afterEach(() => {
  act(() => usePrivacyStore.getState().setValuesHidden(false));
});

describe('useMoneyFormatter', () => {
  it('reactively masks money and quantities across the app', () => {
    const { result } = renderHook(() => useMoneyFormatter());

    expect(result.current.formatCurrency(314021, 'USD', 0)).toBe('$314,021');
    expect(result.current.formatPrice(123.45, 'USD')).toBe('$123.45');
    expect(result.current.formatQuantity(24321.65, 'CASH')).toBe('24,321.65');
    expect(result.current.formatQuantity(0.00842, 'LIQUID_CRYPTO')).toBe('0.00842');

    act(() => usePrivacyStore.getState().toggleValuesHidden());

    expect(result.current.formatCurrency(314021, 'USD', 0)).toBe(MASKED_MONEY_VALUE);
    expect(result.current.formatPrice(123.45, 'USD')).toBe(MASKED_MONEY_VALUE);
    expect(result.current.formatQuantity(24321.65, 'CASH')).toBe(MASKED_MONEY_VALUE);
    expect(result.current.formatQuantity(0.00842, 'LIQUID_CRYPTO')).toBe(MASKED_MONEY_VALUE);
    expect(result.current.formatSignedCurrency(1200, 'USD', 0)).toBe(MASKED_MONEY_VALUE);
    expect(localStorage.getItem(PRIVACY_VALUES_HIDDEN_KEY)).toBe('true');

    act(() => usePrivacyStore.getState().toggleValuesHidden());

    expect(result.current.formatQuantity(24321.65, 'CASH')).toBe('24,321.65');
    expect(result.current.formatQuantity(0.00842, 'LIQUID_CRYPTO')).toBe('0.00842');
  });
});

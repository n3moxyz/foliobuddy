import { beforeEach, describe, expect, it } from 'vitest';
import {
  CUSTOM_LOCATION_OPTIONS_KEY,
  locationOptionsForStorageType,
  saveLocationOptionForStorageType,
} from '../positionOptions';

describe('position storage location options', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists custom options by storage type', () => {
    expect(saveLocationOptionForStorageType('CEX', 'Kraken')).toBe('Kraken');
    expect(locationOptionsForStorageType('CEX')).toContain('Kraken');
    expect(locationOptionsForStorageType('BANK')).not.toContain('Kraken');

    const stored = JSON.parse(localStorage.getItem(CUSTOM_LOCATION_OPTIONS_KEY) ?? '{}');
    expect(stored.CEX).toEqual(['Kraken']);
  });

  it('deduplicates custom options case-insensitively and keeps canonical defaults', () => {
    expect(saveLocationOptionForStorageType('CEX', ' binance ')).toBe('Binance');
    expect(saveLocationOptionForStorageType('CEX', 'KRAKEN')).toBe('KRAKEN');
    expect(saveLocationOptionForStorageType('CEX', 'kraken')).toBe('KRAKEN');

    expect(
      locationOptionsForStorageType('CEX').filter((option) => option === 'KRAKEN')
    ).toHaveLength(1);

    const stored = JSON.parse(localStorage.getItem(CUSTOM_LOCATION_OPTIONS_KEY) ?? '{}');
    expect(stored.CEX).toEqual(['KRAKEN']);
  });

  it('includes one-off current values without saving them', () => {
    expect(locationOptionsForStorageType('BROKERAGE', ['Interactive Brokers'])).toContain(
      'Interactive Brokers'
    );
    expect(localStorage.getItem(CUSTOM_LOCATION_OPTIONS_KEY)).toBeNull();
  });
});

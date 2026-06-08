import { beforeEach, describe, expect, it } from 'vitest';
import {
  CUSTOM_LOCATION_OPTIONS_KEY,
  deleteLocationOptionForStorageType,
  locationOptionsForStorageType,
  renameLocationOptionForStorageType,
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

  it('persists edits to default options as the managed bucket list', () => {
    expect(renameLocationOptionForStorageType('BROKERAGE', 'Tiger', 'IBKR')).toBe('IBKR');

    expect(locationOptionsForStorageType('BROKERAGE')).toEqual([
      'FSMOne',
      'IBKR',
      'UOB Kay Hian',
    ]);

    const stored = JSON.parse(localStorage.getItem(CUSTOM_LOCATION_OPTIONS_KEY) ?? '{}');
    expect(stored.BROKERAGE).toEqual(['FSMOne', 'IBKR', 'UOB Kay Hian']);
    expect(stored.__managedBuckets).toEqual(['BROKERAGE']);
  });

  it('persists deletes to default options as the managed bucket list', () => {
    expect(deleteLocationOptionForStorageType('CEX', 'Binance')).toBe(true);

    expect(locationOptionsForStorageType('CEX')).toEqual(['Bybit', 'Coinbase']);

    const stored = JSON.parse(localStorage.getItem(CUSTOM_LOCATION_OPTIONS_KEY) ?? '{}');
    expect(stored.CEX).toEqual(['Bybit', 'Coinbase']);
    expect(stored.__managedBuckets).toEqual(['CEX']);
  });

  it('keeps legacy custom-only lists merged with defaults until a bucket is managed', () => {
    localStorage.setItem(CUSTOM_LOCATION_OPTIONS_KEY, JSON.stringify({ CEX: ['Kraken'] }));

    expect(locationOptionsForStorageType('CEX')).toEqual([
      'Binance',
      'Bybit',
      'Coinbase',
      'Kraken',
    ]);

    expect(deleteLocationOptionForStorageType('CEX', 'Bybit')).toBe(true);
    expect(locationOptionsForStorageType('CEX')).toEqual(['Binance', 'Coinbase', 'Kraken']);
  });
});

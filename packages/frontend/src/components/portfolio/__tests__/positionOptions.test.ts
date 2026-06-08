import { beforeEach, describe, expect, it } from 'vitest';
import {
  BANK_LOCATIONS,
  BROKER_LOCATIONS,
  CUSTOM_LOCATION_OPTIONS_KEY,
  customLocationOptionsForStorageType,
  deleteLocationOptionForStorageType,
  locationOptionsForStorageType,
  renameLocationOptionForStorageType,
  saveLocationOptionForStorageType,
} from '../positionOptions';

describe('position storage location options', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses standardized broker defaults for equities and cash broker storage', () => {
    expect(BROKER_LOCATIONS).toEqual(['FSMOne', 'IBKR', 'Tiger', 'UOB KH']);
    expect(locationOptionsForStorageType('BROKERAGE')).toEqual([
      'FSMOne',
      'IBKR',
      'Tiger',
      'UOB KH',
    ]);
    expect(locationOptionsForStorageType('BROKERAGE')).not.toContain('DBS');
    expect(BANK_LOCATIONS).toEqual(['Citi', 'DBS', 'SCB', 'Trust+', 'UOB']);
    expect(locationOptionsForStorageType('BANK')).toEqual(['Citi', 'DBS', 'SCB', 'Trust+', 'UOB']);
  });

  it('persists custom options by storage type', () => {
    expect(saveLocationOptionForStorageType('CEX', 'Kraken')).toBe('Kraken');
    expect(locationOptionsForStorageType('CEX')).toContain('Kraken');
    expect(locationOptionsForStorageType('BANK')).not.toContain('Kraken');

    const stored = JSON.parse(localStorage.getItem(CUSTOM_LOCATION_OPTIONS_KEY) ?? '{}');
    expect(stored.CEX).toEqual(['Kraken']);
  });

  it('deduplicates options case-insensitively and does not save defaults as custom options', () => {
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

  it('does not edit or delete default options', () => {
    expect(renameLocationOptionForStorageType('BROKERAGE', 'Tiger', 'Tiger Brokers')).toBeNull();
    expect(deleteLocationOptionForStorageType('CEX', 'Binance')).toBe(false);

    expect(locationOptionsForStorageType('BROKERAGE')).toContain('Tiger');
    expect(locationOptionsForStorageType('CEX')).toContain('Binance');
    expect(localStorage.getItem(CUSTOM_LOCATION_OPTIONS_KEY)).toBeNull();
  });

  it('edits and deletes only custom options', () => {
    expect(saveLocationOptionForStorageType('BROKERAGE', 'Saxo')).toBe('Saxo');
    expect(customLocationOptionsForStorageType('BROKERAGE')).toEqual(['Saxo']);

    expect(renameLocationOptionForStorageType('BROKERAGE', 'Saxo', 'Saxo Markets')).toBe(
      'Saxo Markets'
    );
    expect(customLocationOptionsForStorageType('BROKERAGE')).toEqual(['Saxo Markets']);

    expect(deleteLocationOptionForStorageType('BROKERAGE', 'Saxo Markets')).toBe(true);
    expect(customLocationOptionsForStorageType('BROKERAGE')).toEqual([]);
    expect(locationOptionsForStorageType('BROKERAGE')).toEqual([
      'FSMOne',
      'IBKR',
      'Tiger',
      'UOB KH',
    ]);
  });

  it('ignores legacy managed-bucket flags and keeps defaults protected', () => {
    localStorage.setItem(
      CUSTOM_LOCATION_OPTIONS_KEY,
      JSON.stringify({ CEX: ['Bybit', 'Kraken'], __managedBuckets: ['CEX'] })
    );

    expect(locationOptionsForStorageType('CEX')).toEqual([
      'Binance',
      'Bybit',
      'Coinbase',
      'Kraken',
    ]);

    expect(deleteLocationOptionForStorageType('CEX', 'Bybit')).toBe(false);
    expect(deleteLocationOptionForStorageType('CEX', 'Kraken')).toBe(true);
    expect(locationOptionsForStorageType('CEX')).toEqual(['Binance', 'Bybit', 'Coinbase']);
  });
});

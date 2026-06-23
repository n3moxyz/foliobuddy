import { describe, expect, it } from 'vitest';
import { AssetCategory, StorageType } from '@foliobuddy/shared';
import type { ParsedStatementHolding, Position } from '@/lib/types';
import {
  findMatchingUnitTrustPosition,
  statementBrokerStorageLocation,
} from '../statementMatching';

const baseHolding: ParsedStatementHolding = {
  symbol: 'FUND',
  name: 'Global Income Fund',
  isin: 'SG9999999999',
  nativeCurrency: 'SGD',
  units: 1000,
  avgCostNative: 1.2,
  navNative: 1.3,
  navUsd: 0.96,
  currentValueNative: 1300,
  totalCostNative: 1200,
  totalCostUsd: 888.89,
  fxRateToUsd: 0.74074,
  navAsOfDate: '2026-05-31T00:00:00.000Z',
  yahooSymbol: '0P00000ABC.SI',
};

type PositionOverrides = Partial<Omit<Position, 'asset'>> & {
  asset?: Partial<Position['asset']>;
};

function makePosition(overrides: PositionOverrides = {}): Position {
  const { asset: assetOverrides, ...positionOverrides } = overrides;

  return {
    id: 'position-1',
    assetId: 'asset-1',
    quantity: 100,
    avgCostUsd: 1,
    storageType: StorageType.BROKERAGE,
    storageLocation: 'FSMOne',
    notes: null,
    custodyOf: null,
    marketValueUsd: 100,
    unrealizedPnL: 0,
    unrealizedPnLPct: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...positionOverrides,
    asset: {
      id: 'asset-1',
      coingeckoId: null,
      priceProvider: 'manual',
      providerAssetId: null,
      nativeCurrency: 'SGD',
      exchange: null,
      factsheetUrl: null,
      isin: 'SG9999999999',
      symbol: 'FUND',
      name: 'Global Income Fund',
      category: AssetCategory.UNIT_TRUST,
      currentPriceUsd: 1,
      priceUpdatedAt: null,
      ...assetOverrides,
    },
  };
}

describe('statementMatching', () => {
  it('maps known statement brokers to app storage locations', () => {
    expect(statementBrokerStorageLocation('UOB Kay Hian')).toBe('UOB KH');
    expect(statementBrokerStorageLocation('FSMOne / iFAST')).toBe('FSMOne');
    expect(statementBrokerStorageLocation('Custom Broker')).toBe('Custom Broker');
  });

  it('matches an existing unit trust by ISIN first', () => {
    const match = findMatchingUnitTrustPosition(
      { ...baseHolding, symbol: 'OTHER', yahooSymbol: null },
      [makePosition({ asset: { symbol: 'OLD' } })],
      'FSMOne'
    );

    expect(match?.position.id).toBe('position-1');
    expect(match?.reason).toBe('isin');
  });

  it('uses the statement broker to break ties between the same fund in two accounts', () => {
    const uobPosition = makePosition({
      id: 'position-uob',
      storageLocation: 'UOB KH',
    });
    const fsmPosition = makePosition({
      id: 'position-fsm',
      storageLocation: 'FSMOne',
    });

    const match = findMatchingUnitTrustPosition(
      baseHolding,
      [uobPosition, fsmPosition],
      'UOB Kay Hian'
    );

    expect(match?.position.id).toBe('position-uob');
    expect(match?.reason).toBe('isin');
  });

  it('falls back to Yahoo/provider symbol when ISIN is unavailable', () => {
    const match = findMatchingUnitTrustPosition(
      { ...baseHolding, isin: '', yahooSymbol: '0P00000ABC.SI' },
      [
        makePosition({
          asset: {
            isin: null,
            providerAssetId: '0P00000ABC.SI',
            symbol: 'LEGACY',
          },
        }),
      ],
      'FSMOne'
    );

    expect(match?.position.id).toBe('position-1');
    expect(match?.reason).toBe('provider-symbol');
  });

  it('falls back to exact symbol or exact name when stronger identifiers are absent', () => {
    const symbolMatch = findMatchingUnitTrustPosition(
      { ...baseHolding, isin: '', yahooSymbol: null },
      [makePosition({ asset: { isin: null, providerAssetId: null, symbol: 'FUND' } })],
      'FSMOne'
    );

    const nameMatch = findMatchingUnitTrustPosition(
      { ...baseHolding, isin: '', symbol: 'NEW', yahooSymbol: null },
      [
        makePosition({
          asset: {
            isin: null,
            providerAssetId: null,
            symbol: 'OLD',
            name: 'Global Income Fund',
          },
        }),
      ],
      'FSMOne'
    );

    expect(symbolMatch?.reason).toBe('asset-symbol');
    expect(nameMatch?.reason).toBe('name');
  });

  it('ignores non-unit-trust positions even when identifiers match', () => {
    const match = findMatchingUnitTrustPosition(
      baseHolding,
      [
        makePosition({
          asset: {
            category: AssetCategory.EQUITY,
            isin: baseHolding.isin,
          },
        }),
      ],
      'FSMOne'
    );

    expect(match).toBeNull();
  });
});

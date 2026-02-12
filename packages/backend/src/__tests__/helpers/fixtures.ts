/**
 * Mock data factories for integration tests.
 * Each returns a realistic object with sensible defaults.
 */

export function mockAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: 'asset-1',
    coingeckoId: 'bitcoin',
    symbol: 'BTC',
    name: 'Bitcoin',
    category: 'LIQUID_CRYPTO',
    currentPriceUsd: 50000,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

export function mockPosition(overrides: Record<string, unknown> = {}) {
  return {
    id: 'position-1',
    userId: 'test-user-id',
    assetId: 'asset-1',
    quantity: 1.5,
    avgCostUsd: 30000,
    storageType: 'CEX',
    storageLocation: 'Binance',
    notes: null,
    marketValueUsd: 75000,
    unrealizedPnL: 30000,
    unrealizedPnLPct: 66.67,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    asset: mockAsset(),
    ...overrides,
  };
}

export function mockTrade(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trade-1',
    userId: 'test-user-id',
    assetId: 'asset-1',
    direction: 'LONG',
    entryPrice: 40000,
    exitPrice: 50000,
    quantity: 1,
    positionSizeUsd: 40000,
    entryDate: new Date('2024-01-01'),
    exitDate: new Date('2024-02-01'),
    status: 'CLOSED',
    realizedPnL: 10000,
    realizedPnLPct: 25,
    notes: null,
    tags: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    asset: mockAsset(),
    ...overrides,
  };
}

export function mockSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'snapshot-1',
    userId: 'test-user-id',
    timestamp: new Date('2024-01-01'),
    snapshotType: 'DAILY',
    source: 'MANUAL',
    totalValueUsd: 100000,
    totalCostBasis: 80000,
    notes: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    positions: [],
    ...overrides,
  };
}

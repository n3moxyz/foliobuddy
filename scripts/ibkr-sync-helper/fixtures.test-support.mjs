import { hash } from './audit.mjs';

export const response = (structuredContent) => ({
  content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
  structuredContent,
  isError: false,
});
export function fixtureCapture() {
  const sample = {
    capturedAt: new Date().toISOString(),
    positions: [
      {
        contract_id: 777,
        contract_description: 'TEST @NASDAQ',
        position: 10,
        average_price: 75,
        market_price: 100,
        market_value: 1000,
        currency: 'USD',
        asset_class: 'STK',
      },
    ],
    balances: [
      { currency: 'USD', cash_balance: 100, exchange_rate: 1, stock_market_value: 1000 },
      { currency: 'BASE', cash_balance: 100, exchange_rate: 1, stock_market_value: 1000 },
    ],
    summary: {
      currency: 'USD',
      total_cash_value: 100,
      gross_position_value: 1000,
      net_liquidation: 1100,
    },
  };
  return {
    version: 1,
    first: structuredClone(sample),
    second: structuredClone(sample),
    executions: [],
  };
}
export function fixtureCheckpoint(capture = fixtureCapture()) {
  const common = {
    userId: 'fictional-owner',
    custodyOf: null,
    storageType: 'BROKERAGE',
    storageLocation: 'IBKR',
    notes: null,
    historyHash: 'unchanged-history',
    ibkrSyncedAt: null,
  };
  const before = [
    {
      ...common,
      id: 'cash',
      assetId: 'usd',
      quantity: 90,
      avgCostUsd: 1,
      avgCostNative: null,
      costCurrency: null,
      ibkrContractId: null,
      ibkrCash: null,
      asset: {
        id: 'usd',
        category: 'CASH',
        symbol: 'USD',
        nativeCurrency: 'USD',
        priceProvider: 'manual',
        providerAssetId: null,
      },
    },
    {
      ...common,
      id: 'stock',
      assetId: 'test',
      quantity: 8,
      avgCostUsd: 72,
      avgCostNative: 72,
      costCurrency: 'USD',
      ibkrContractId: 777,
      ibkrCash: null,
      asset: {
        id: 'test',
        category: 'EQUITY',
        symbol: 'TEST',
        nativeCurrency: 'USD',
        priceProvider: 'yahoo',
        providerAssetId: 'TEST',
      },
    },
  ];
  const after = structuredClone(before);
  after[0].quantity = 100;
  after[0].ibkrSyncedAt = capture.second.capturedAt;
  after[0].ibkrCash = {
    source: 'ibkr',
    capturedAt: capture.second.capturedAt,
    baseCurrency: 'USD',
    baseCash: 100,
    baseToUsd: 1,
    netCashUsd: 100,
    balances: [{ currency: 'USD', cashBalance: 100, fxRateToUsd: 1 }],
  };
  after[1].quantity = 10;
  after[1].avgCostNative = 75;
  after[1].ibkrSyncedAt = capture.second.capturedAt;
  const backup = {
    version: 1,
    before,
    after,
    source: capture,
    captureHash: hash({ kind: 'sync', cashPositionId: 'cash', source: capture }),
  };
  return { backup, state: hash({ before, after }) };
}

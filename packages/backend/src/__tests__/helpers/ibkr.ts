import type { IbkrCapture } from '../../services/ibkrCapture.js';

export function fictionalIbkrCapture(now = new Date()): IbkrCapture {
  const positions = [
    {
      contract_id: 101,
      contract_description: 'TEST @NASDAQ',
      currency: 'USD',
      position: 20,
      average_price: 41.125,
      market_price: 50,
      market_value: 1000,
      asset_class: 'STK' as const,
    },
  ];
  const sample = {
    capturedAt: now.toISOString(),
    positions,
    balances: [
      { currency: 'BASE', cash_balance: -200, exchange_rate: 1, stock_market_value: 1000 },
      { currency: 'USD', cash_balance: 100, exchange_rate: 1, stock_market_value: 1000 },
      { currency: 'JPY', cash_balance: -45000, exchange_rate: 1 / 150, stock_market_value: 0 },
    ],
    summary: {
      currency: 'USD',
      total_cash_value: -200,
      gross_position_value: 1000,
      net_liquidation: 800,
    },
  };
  return {
    version: 1,
    first: structuredClone(sample),
    second: structuredClone(sample),
    executions: [],
  };
}

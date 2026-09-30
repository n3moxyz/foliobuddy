import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';

const number = z.number().finite();
const currency = z.string().regex(/^[A-Z]{3}$/);
const holding = z.object({
  contract_id: z.number().int().positive().max(2147483647),
  contract_description: z.string().trim().min(1).max(100),
  position: number.positive(),
  average_price: number.min(0),
  market_price: number.min(0),
  market_value: number.min(0),
  currency,
  asset_class: z.literal('STK'),
});
const balance = z.object({
  currency: z.union([currency, z.literal('BASE')]),
  cash_balance: number,
  exchange_rate: number.positive(),
  stock_market_value: number.min(0),
});
const sample = z.object({
  capturedAt: z.string().datetime(),
  positions: z.array(holding).min(1).max(100),
  balances: z.array(balance).min(1).max(40),
  summary: z.object({
    currency,
    total_cash_value: number,
    gross_position_value: number.min(0),
    net_liquidation: number,
  }),
});
export const ibkrCaptureSchema = z.object({
  version: z.literal(1),
  first: sample,
  second: sample,
  executions: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        symbol: z.string().min(1).max(40),
        currency,
        side: z.enum(['BUY', 'SELL']),
        quantity: number.positive(),
        date: z.string().datetime(),
      })
    )
    .max(2000)
    .default([]),
});
export type IbkrCapture = z.infer<typeof ibkrCaptureSchema>;
export type IbkrHolding = IbkrCapture['first']['positions'][number];
export interface IbkrCashSnapshot {
  capturedAt: string;
  source: 'ibkr' | 'manual';
  baseCurrency: string;
  baseCash: number;
  baseToUsd: number;
  netCashUsd: number;
  balances: Array<{ currency: string; cashBalance: number; fxRateToUsd: number }>;
}

export function requireIbkr(value: unknown, message: string): asserts value {
  if (!value) throw new AppError(message, 409);
}
function close(a: number, b: number, absolute = 0.05, relative = 0) {
  return Math.abs(a - b) <= Math.max(absolute, Math.abs(b) * relative);
}
export function ibkrYahooSymbol(position: IbkrHolding): string {
  const match = /^([A-Za-z0-9.^-]+) @([A-Z0-9]+)$/.exec(position.contract_description);
  requireIbkr(match, 'IBKR instrument description needs a verified exchange ticker');
  const [, code, exchange] = match;
  const suffix: Record<string, { currency: string; suffix: string }> = {
    KRX: { currency: 'KRW', suffix: '.KS' },
    KOSDAQ: { currency: 'KRW', suffix: '.KQ' },
    TSEJ: { currency: 'JPY', suffix: '.T' },
    OSE: { currency: 'NOK', suffix: '.OL' },
    NYSE: { currency: 'USD', suffix: '' },
    NASDAQ: { currency: 'USD', suffix: '' },
    ARCA: { currency: 'USD', suffix: '' },
    SMART: { currency: 'USD', suffix: '' },
    SGX: { currency: 'SGD', suffix: '.SI' },
    TSE: { currency: 'TWD', suffix: '.TW' },
  };
  const venue = suffix[exchange];
  requireIbkr(venue?.currency === position.currency, 'IBKR exchange/currency needs review');
  return code.toUpperCase() + venue.suffix;
}

/** Validate completeness independently of the app's holdings or a caller's flag. */
export function validateIbkrCapture(raw: unknown, now = Date.now()) {
  const capture = ibkrCaptureSchema.parse(raw);
  const firstTime = Date.parse(capture.first.capturedAt);
  const secondTime = Date.parse(capture.second.capturedAt);
  requireIbkr(
    firstTime <= secondTime &&
      secondTime - firstTime <= 180000 &&
      now - firstTime <= 900000 &&
      secondTime <= now + 30000,
    'IBKR capture must contain two recent reads within three minutes'
  );
  const sorted = (s: IbkrCapture['first']) =>
    [...s.positions]
      .sort((a, b) => a.contract_id - b.contract_id)
      .map((p) => [
        p.contract_id,
        p.contract_description,
        p.currency,
        p.position,
        p.average_price,
        p.asset_class,
      ]);
  requireIbkr(
    JSON.stringify(sorted(capture.first)) === JSON.stringify(sorted(capture.second)),
    'IBKR holdings changed between reads; capture again'
  );
  const cashAmounts = (s: IbkrCapture['first']) =>
    s.balances
      .filter((b) => b.currency !== 'BASE')
      .map((b) => [b.currency, b.cash_balance])
      .sort(([a], [b]) => String(a).localeCompare(String(b)));
  requireIbkr(
    JSON.stringify(cashAmounts(capture.first)) === JSON.stringify(cashAmounts(capture.second)),
    'IBKR currency cash changed between reads; capture again'
  );
  requireIbkr(
    capture.first.summary.currency === capture.second.summary.currency,
    'IBKR base currency changed between reads'
  );
  const baseCashValues = [capture.first, capture.second].map((s) => {
    const base = s.balances.find((b) => b.currency === 'BASE');
    requireIbkr(base, 'IBKR BASE cash aggregate is missing');
    return base.cash_balance;
  });
  let cash!: IbkrCashSnapshot;
  for (const s of [capture.first, capture.second]) {
    requireIbkr(
      new Set(s.positions.map((p) => p.contract_id)).size === s.positions.length,
      'Duplicate IBKR contracts'
    );
    requireIbkr(
      new Set(s.balances.map((b) => b.currency)).size === s.balances.length,
      'Duplicate IBKR currency balances'
    );
    const base = s.balances.find((b) => b.currency === 'BASE');
    requireIbkr(base, 'IBKR BASE cash aggregate is missing');
    const native = s.balances.filter((b) => b.currency !== 'BASE');
    const usd =
      s.summary.currency === 'USD'
        ? 1
        : s.balances.find((b) => b.currency === 'USD')?.exchange_rate;
    requireIbkr(usd && Number.isFinite(usd) && usd > 0, 'IBKR USD conversion rate is missing');
    const sum = native.reduce((total, b) => total + b.cash_balance * b.exchange_rate, 0);
    // Separately quoted FX and BASE can differ by a few base-currency cents.
    // Keep that bounded; large balances also need the reported-rate rounding budget.
    const rounding = native.reduce((total, b) => total + Math.abs(b.cash_balance) * 0.000000005, 0);
    requireIbkr(
      close(sum, base.cash_balance, Math.max(0.1, rounding)),
      'IBKR currency cash does not tally with BASE; incomplete capture'
    );
    requireIbkr(
      s.summary.total_cash_value >= Math.min(...baseCashValues) - 0.05 &&
        s.summary.total_cash_value <= Math.max(...baseCashValues) + 0.05,
      'IBKR cash summary differs from its currency balances'
    );
    for (const p of s.positions) {
      requireIbkr(
        Number.isFinite(p.position * p.average_price),
        'IBKR native cost exceeds the supported numeric range'
      );
      requireIbkr(
        close(p.market_value, p.position * p.market_price, 1, 0.000001),
        'IBKR quantity and market value differ'
      );
      ibkrYahooSymbol(p);
    }
    const gross = s.positions.reduce((total, p) => {
      const rate = s.balances.find((b) => b.currency === p.currency)?.exchange_rate;
      requireIbkr(rate, 'A holding currency is missing from the IBKR balances');
      return total + p.market_value * rate;
    }, 0);
    requireIbkr(
      close(gross, s.summary.gross_position_value, 1, 0.01) &&
        close(base.stock_market_value, s.summary.gross_position_value, 1, 0.01),
      'IBKR securities do not tally with the account summary'
    );
    for (const b of native) {
      const subtotal = s.positions
        .filter((p) => p.currency === b.currency)
        .reduce((total, p) => total + p.market_value, 0);
      requireIbkr(
        close(subtotal, b.stock_market_value, 1, 0.01),
        'IBKR currency securities subtotal is incomplete'
      );
    }
    cash = {
      capturedAt: s.capturedAt,
      source: 'ibkr',
      baseCurrency: s.summary.currency,
      baseCash: base.cash_balance,
      baseToUsd: 1 / usd,
      netCashUsd: base.cash_balance / usd,
      balances: native.map((b) => ({
        currency: b.currency,
        cashBalance: b.cash_balance,
        fxRateToUsd: b.exchange_rate / usd,
      })),
    };
    requireIbkr(
      Number.isFinite(cash.netCashUsd) &&
        cash.balances.every(
          (b) => Number.isFinite(b.fxRateToUsd) && Number.isFinite(b.cashBalance * b.fxRateToUsd)
        ),
      'IBKR cash conversion exceeds the supported numeric range'
    );
  }
  requireIbkr(
    new Set(capture.executions.map((e) => e.id)).size === capture.executions.length,
    'Duplicate broker executions'
  );
  return { capture, cash };
}

export function isIbkrCash(position: {
  asset: { category: string };
  storageType: string;
  storageLocation?: string | null;
  custodyOf?: string | null;
}) {
  return (
    position.asset.category === 'CASH' &&
    position.storageType === 'BROKERAGE' &&
    position.storageLocation === 'IBKR' &&
    !position.custodyOf
  );
}

import { prisma } from '../lib/prisma.js';
import { calculatePositionValue } from '../lib/domain.js';
import { AppError } from '../middleware/errorHandler.js';

type Transaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
export type FxDb = Pick<Transaction, 'fxRate'>;
export const FIAT_CASH_CURRENCIES = ['USD', 'SGD', 'GBP'] as const;
type Currency = (typeof FIAT_CASH_CURRENCIES)[number];
type CashAsset = {
  category?: string;
  symbol?: string;
  priceProvider?: string;
  nativeCurrency?: string;
  currentPriceUsd: number | null;
};
type Fx = { toCcy: string; rate: number; timestamp: Date };

export function fiatCashCurrency(asset: CashAsset): Currency | null {
  const symbol = asset.symbol?.trim().toUpperCase();
  return asset.category === 'CASH' &&
    asset.priceProvider === 'manual' &&
    FIAT_CASH_CURRENCIES.includes(symbol as Currency)
    ? (symbol as Currency)
    : null;
}

async function cashRates(assets: CashAsset[], db: FxDb) {
  const currencies = [...new Set(assets.map(fiatCashCurrency).filter((c) => c && c !== 'USD'))];
  const rates = currencies.length
    ? await db.fxRate.findMany({ where: { fromCcy: 'USD', toCcy: { in: currencies as string[] } } })
    : [];
  return new Map<string, Fx>(rates.map((rate) => [rate.toCcy, rate]));
}

function quote<T extends CashAsset>(asset: T, rates: Map<string, Fx>): T {
  const currency = fiatCashCurrency(asset);
  if (!currency) return asset;
  const fx = rates.get(currency);
  if (
    currency !== 'USD' &&
    (!fx ||
      !Number.isFinite(fx.rate) ||
      fx.rate <= 0 ||
      !Number.isFinite(fx.timestamp.getTime()) ||
      Date.now() - fx.timestamp.getTime() > 48 * 3600000 ||
      fx.timestamp.getTime() - Date.now() > 300000)
  )
    throw new AppError(
      `A recent USD/${currency} exchange rate is required to value fiat cash`,
      503
    );
  const price = currency === 'USD' ? 1 : 1 / fx!.rate;
  if (!Number.isFinite(price) || price <= 0)
    throw new AppError('Invalid fiat cash conversion', 503);
  return {
    ...asset,
    nativeCurrency: currency,
    currentPriceUsd: price,
    ...(fx ? { priceUpdatedAt: fx.timestamp } : {}),
  };
}

/** Resolve the quote inside the caller's transaction before changing cash units. */
export async function currentFiatCashAsset<T extends CashAsset>(
  asset: T,
  db: FxDb = prisma
): Promise<T> {
  return quote(asset, await cashRates([asset], db));
}

/** An unavailable cash quote must not make unrelated catalog assets unavailable. */
export async function projectFiatCashAssets<T extends CashAsset>(
  assets: T[],
  db: FxDb = prisma
): Promise<T[]> {
  const rates = await cashRates(assets, db);
  return assets.map((asset) => {
    try {
      return quote(asset, rates);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      return { ...asset, currentPriceUsd: null, priceUpdatedAt: null };
    }
  });
}

export async function projectFiatCashPositions<
  T extends {
    quantity: number;
    avgCostUsd: number;
    ibkrCash?: unknown;
    asset: CashAsset;
  },
>(positions: T[], db: FxDb = prisma): Promise<T[]> {
  const eligible = positions.filter((p) => !p.ibkrCash && fiatCashCurrency(p.asset));
  if (!eligible.length) return positions;
  const rates = await cashRates(
    eligible.map((p) => p.asset),
    db
  );
  return positions.map((position) => {
    if (position.ibkrCash || !fiatCashCurrency(position.asset)) return position;
    const asset = quote(position.asset, rates);
    return {
      ...position,
      asset,
      ...calculatePositionValue({ ...position, currentPriceUsd: asset.currentPriceUsd }),
    };
  });
}

/** Publish FX, cash quotes and current position values in the same transaction. */
export async function revalueFiatCash(tx: Transaction) {
  const assets = await tx.asset.findMany({
    where: {
      category: 'CASH',
      priceProvider: 'manual',
      symbol: { in: [...FIAT_CASH_CURRENCIES], mode: 'insensitive' },
    },
  });
  const rates = await cashRates(assets, tx);
  for (const asset of assets) {
    if (!fiatCashCurrency(asset)) continue;
    let priced;
    try {
      priced = quote(asset, rates);
    } catch (error) {
      if (error instanceof AppError) continue;
      throw error;
    }
    await tx.asset.update({
      where: { id: asset.id },
      data: {
        currentPriceUsd: priced.currentPriceUsd,
        nativeCurrency: priced.nativeCurrency,
        priceUpdatedAt: priced.priceUpdatedAt,
      },
    });
    const positions = await tx.position.findMany({
      where: { assetId: asset.id },
      select: { id: true, quantity: true, avgCostUsd: true, ibkrCash: true },
    });
    for (const position of positions) {
      if (position.ibkrCash) continue;
      const values = calculatePositionValue({
        ...position,
        currentPriceUsd: priced.currentPriceUsd,
      });
      if (Object.values(values).some((value) => value != null && !Number.isFinite(value)))
        throw new AppError('Non-finite fiat cash valuation', 400);
      await tx.position.update({ where: { id: position.id }, data: values });
    }
  }
}

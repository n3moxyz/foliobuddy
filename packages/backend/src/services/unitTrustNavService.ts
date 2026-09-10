import { prisma } from '../lib/prisma.js';
import { calculatePositionValue } from '../lib/domain.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../lib/logger.js';
import {
  FUND_MANAGER_SOURCES,
  findFundManagerSource,
  parseNavDate,
} from './providers/fundManagerSources.js';
import type { ProviderPrice } from './providers/types.js';

type Transaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function navToUsd(
  nav: number,
  currency: string,
  db: Pick<Transaction, 'fxRate'> = prisma
) {
  if (!Number.isFinite(nav) || nav <= 0) throw new AppError('NAV must be positive and finite', 400);
  if (currency === 'USD') return { priceUsd: nav, fxRateToUsd: 1 };
  if (currency !== 'SGD') throw new AppError(`Unsupported NAV currency ${currency}`, 400);
  const fx = await db.fxRate.findUnique({
    where: { fromCcy_toCcy: { fromCcy: 'USD', toCcy: currency } },
  });
  if (
    !fx ||
    !Number.isFinite(fx.rate) ||
    fx.rate <= 0 ||
    !Number.isFinite(fx.timestamp.getTime()) ||
    fx.timestamp.getTime() - Date.now() > 5 * 60000 ||
    Date.now() - fx.timestamp.getTime() > 48 * 3600000
  ) {
    throw new AppError('A recent USD/SGD exchange rate is required to value this NAV', 503);
  }
  const priceUsd = nav / fx.rate;
  if (!Number.isFinite(priceUsd) || priceUsd <= 0)
    throw new AppError('Invalid NAV conversion', 400);
  return { priceUsd, fxRateToUsd: 1 / fx.rate };
}

export async function navTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (
        attempt >= 2 ||
        !error ||
        typeof error !== 'object' ||
        !('code' in error) ||
        !['P2034', 'P2002'].includes(String(error.code))
      )
        throw error;
    }
  }
}

async function prepareNavPositions(tx: Transaction, assetId: string, currentPriceUsd: number) {
  const positions = await tx.position.findMany({
    where: { assetId },
    select: { id: true, quantity: true, avgCostUsd: true },
  });
  return positions.map((position) => {
    const data = calculatePositionValue({ ...position, currentPriceUsd });
    if (Object.values(data).some((value) => value != null && !Number.isFinite(value))) {
      throw new AppError('Non-finite position valuation', 400);
    }
    return { where: { id: position.id }, data };
  });
}

async function updateNavPositions(tx: Transaction, assetId: string, currentPriceUsd: number) {
  for (const update of await prepareNavPositions(tx, assetId, currentPriceUsd)) {
    await tx.position.update(update);
  }
}

/** Historical imports never take ownership away from an automatic source. */
export async function saveManualNav(
  assetId: string,
  nav: number,
  asOf: string | undefined,
  userId: string,
  transaction?: Transaction
) {
  const timestamp = parseManualNavDate(asOf);
  const save = async (tx: Transaction) => {
    const asset = await tx.asset.findUniqueOrThrow({ where: { id: assetId } });
    if (asset.category !== 'UNIT_TRUST' && asset.priceProvider !== 'manual') {
      throw new AppError('NAV updates only apply to unit trusts or manually-priced assets', 400);
    }
    const converted = await navToUsd(nav, asset.nativeCurrency, tx);
    const history = {
      ...converted,
      nativePrice: nav,
      nativeCurrency: asset.nativeCurrency,
      source: 'manual',
      updatedBy: userId,
    };
    await tx.priceHistory.upsert({
      where: { assetId_timestamp_source: { assetId, timestamp, source: 'manual' } },
      create: { assetId, timestamp, ...history },
      update: history,
    });
    const automaticHasQuote =
      asset.priceProvider !== 'manual' && asset.priceSource !== 'manual' && asset.priceAsOf != null;
    if (automaticHasQuote || isLaterNavDay(asset.priceAsOf, timestamp)) return asset;
    const updated = await tx.asset.update({
      where: { id: assetId },
      data: {
        currentPriceUsd: converted.priceUsd,
        currentPriceNative: nav,
        priceFxRateToUsd: converted.fxRateToUsd,
        priceAsOf: timestamp,
        priceUpdatedAt: timestamp,
        priceSource: 'manual',
      },
    });
    await updateNavPositions(tx, assetId, converted.priceUsd);
    return updated;
  };
  return transaction ? save(transaction) : navTransaction(save);
}

export function parseManualNavDate(asOf?: string): Date {
  try {
    return parseNavDate((asOf ?? new Date().toISOString()).slice(0, 10));
  } catch {
    throw new AppError('NAV date must be a valid calendar date, no later than today', 400);
  }
}

function isLaterNavDay(previous: Date | null, next: Date): boolean {
  return !!previous && previous.toISOString().slice(0, 10) > next.toISOString().slice(0, 10);
}

export async function saveAutomaticNav(
  assetId: string,
  quote: ProviderPrice,
  source: string,
  checkedAt: Date
) {
  if (!quote.asOf || !Number.isFinite(quote.asOf.getTime()))
    throw new Error('Source has no NAV valuation date');
  const timestamp = parseNavDate(quote.asOf.toISOString().slice(0, 10));
  if (Date.now() - timestamp.getTime() > 7 * 86400000)
    throw new Error('Manager NAV is more than seven days old');
  return navTransaction(async (tx) => {
    const asset = await tx.asset.findUniqueOrThrow({ where: { id: assetId } });
    if (
      asset.category !== 'UNIT_TRUST' ||
      asset.priceProvider !== source ||
      asset.nativeCurrency !== quote.nativeCurrency
    )
      throw new Error('NAV asset/source/currency mismatch');
    if (
      source === 'fund-manager' &&
      (!findFundManagerSource(asset) ||
        quote.isin !== asset.isin ||
        asset.providerAssetId !== quote.isin)
    ) {
      throw new Error('NAV share class mismatch');
    }
    if (asset.priceCheckedAt && asset.priceCheckedAt > checkedAt) return asset;
    if (isLaterNavDay(asset.priceAsOf, timestamp))
      throw new Error('Source NAV predates the last good valuation');
    const converted = await navToUsd(quote.nativePrice ?? NaN, asset.nativeCurrency, tx);
    const history = {
      ...converted,
      nativePrice: quote.nativePrice!,
      nativeCurrency: asset.nativeCurrency,
      source,
    };
    await tx.priceHistory.upsert({
      where: { assetId_timestamp_source: { assetId, timestamp, source } },
      create: { assetId, timestamp, ...history },
      // Same-date corrections are legitimate. Rechecks do not change the date.
      update: history,
    });
    const updated = await tx.asset.update({
      where: { id: assetId },
      data: {
        currentPriceUsd: converted.priceUsd,
        currentPriceNative: quote.nativePrice,
        priceFxRateToUsd: converted.fxRateToUsd,
        priceAsOf: timestamp,
        priceUpdatedAt: timestamp,
        priceSource: source,
        priceCheckedAt: checkedAt,
        priceCheckStatus: 'ok',
      },
    });
    await updateNavPositions(tx, assetId, converted.priceUsd);
    return updated;
  });
}

export async function recordNavFailure(assetId: string, checkedAt: Date, error: unknown) {
  logger.warn(`[Unit Trust NAV] Refresh failed for ${assetId}; retaining last good NAV`, error);
  await prisma.asset.updateMany({
    where: { id: assetId, OR: [{ priceCheckedAt: null }, { priceCheckedAt: { lte: checkedAt } }] },
    data: { priceCheckedAt: checkedAt, priceCheckStatus: 'error' },
  });
}

/** Called in the SAME transaction as FX writes. Never invents a new NAV date. */
export async function revalueNativeNavs(tx: Transaction): Promise<string[]> {
  const assets = await tx.asset.findMany({
    where: { category: 'UNIT_TRUST', currentPriceNative: { not: null } },
  });
  const changed: string[] = [];
  for (const asset of assets) {
    let converted;
    let positionUpdates;
    try {
      converted = await navToUsd(asset.currentPriceNative!, asset.nativeCurrency, tx);
      if (asset.currentPriceUsd === converted.priceUsd) continue;
      positionUpdates = await prepareNavPositions(tx, asset.id, converted.priceUsd);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      logger.error(
        `[Unit Trust NAV] Cannot revalue ${asset.id}; retaining its last valuation`,
        error
      );
      continue;
    }
    await tx.asset.update({
      where: { id: asset.id },
      data: {
        currentPriceUsd: converted.priceUsd,
        priceFxRateToUsd: converted.fxRateToUsd,
      },
    });
    for (const update of positionUpdates) await tx.position.update(update);
    changed.push(asset.id);
  }
  return changed;
}

/** No holdings/snapshot changes. Dry-run is the operational script's default. */
export async function configureKnownUnitTrusts(apply = false) {
  return navTransaction(async (tx) => {
    const assets = await tx.asset.findMany({ where: { category: 'UNIT_TRUST' } });
    const changes: Array<{ assetId: string; isin: string; action: string }> = [];
    for (const fund of FUND_MANAGER_SOURCES) {
      const matches = assets.filter((asset) => findFundManagerSource(asset)?.isin === fund.isin);
      const configured = matches.find(
        (asset) => asset.priceProvider === 'fund-manager' && asset.providerAssetId === fund.isin
      );
      if (matches.length > 1) {
        for (const conflict of matches.filter((asset) => asset.id !== configured?.id)) {
          changes.push({
            assetId: conflict.id,
            isin: fund.isin,
            action: 'conflict: reconcile identity',
          });
        }
        logger.error(
          `[Unit Trust NAV] Conflicting records for ${fund.isin}; retaining established feeds`
        );
      }
      const asset = configured ?? (matches.length === 1 ? matches[0] : undefined);
      if (!asset) continue;
      if (asset.priceProvider === 'fund-manager' && asset.providerAssetId === fund.isin) continue;
      changes.push({
        assetId: asset.id,
        isin: fund.isin,
        action: apply ? 'configured' : 'would configure',
      });
      if (apply)
        await tx.asset.update({
          where: { id: asset.id },
          data: {
            priceProvider: 'fund-manager',
            providerAssetId: fund.isin,
            isin: fund.isin,
            priceCheckStatus: 'pending',
            priceCheckedAt: null,
          },
        });
    }
    return changes;
  });
}

import { prisma } from '../lib/prisma.js';
import { impliedYahooTicker, isUnpricedAsset } from '../lib/domain.js';
import { logger } from '../lib/logger.js';

type Transaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// One findFirst per candidate plus eight writes per merge can outlast Prisma's 5 s default.
const REPAIR_TRANSACTION_TIMEOUT_MS = 60_000;

interface Listing {
  id: string;
  category: string;
  name: string;
  nativeCurrency: string;
  exchange: string | null;
}

/** Name, currency and exchange ride along so a dry run can be checked before --apply. */
export interface CatalogRepairChange extends Omit<Listing, 'id' | 'category'> {
  assetId: string;
  ticker: string;
  action: string;
}

/**
 * Older imports left EQUITY rows on a provider with no id, so the price job skips
 * them forever. Point each at its Yahoo ticker, or, when a live row already holds
 * that ticker, optionally fold the dead row into it. Dry-run unless `apply`.
 */
export async function repairUnpricedEquities({ apply = false, mergeDuplicates = false } = {}) {
  return prisma.$transaction(
    async (tx) => {
      const equities = await tx.asset.findMany({
        where: { category: 'EQUITY' },
        orderBy: { id: 'asc' },
      });
      // Tickers this run already pointed at a row, so a second dead row with the same
      // ticker is treated as a duplicate even in a dry run where nothing was written.
      const claimed = new Map<string, Listing>();
      const changes: CatalogRepairChange[] = [];
      for (const asset of equities.filter(isUnpricedAsset)) {
        const ticker = asset.symbol.trim().toUpperCase();
        const { name, nativeCurrency, exchange } = asset;
        const change = { assetId: asset.id, ticker, name, nativeCurrency, exchange };
        if (!ticker) {
          changes.push({ ...change, action: 'conflict: blank symbol' });
          continue;
        }
        const holder =
          claimed.get(ticker) ??
          (await tx.asset.findFirst({
            where: { priceProvider: 'yahoo', providerAssetId: ticker },
          }));
        const action = await resolveCandidate(tx, asset, ticker, holder, {
          apply,
          mergeDuplicates,
        });
        if (!holder && !action.startsWith('conflict:')) claimed.set(ticker, asset);
        changes.push({ ...change, action });
      }
      return changes;
    },
    { isolationLevel: 'Serializable', timeout: REPAIR_TRANSACTION_TIMEOUT_MS }
  );
}

async function resolveCandidate(
  tx: Transaction,
  asset: Listing,
  ticker: string,
  holder: Listing | null,
  { apply, mergeDuplicates }: { apply: boolean; mergeDuplicates: boolean }
): Promise<string> {
  if (!holder) {
    if (!impliedYahooTicker(ticker, asset.nativeCurrency))
      return `conflict: ${asset.nativeCurrency} listing ${ticker} has no Yahoo exchange suffix`;
    if (apply)
      await tx.asset.update({
        where: { id: asset.id },
        data: { priceProvider: 'yahoo', providerAssetId: ticker },
      });
    return apply ? 'repaired' : 'would repair';
  }
  if (holder.category !== 'EQUITY') {
    logger.error(`[Catalog repair] yahoo ${ticker} is held by ${holder.category} ${holder.id}`);
    return `conflict: yahoo ${ticker} belongs to ${holder.category} ${holder.id}`;
  }
  // A merge deletes the dead row, so a shared bare ticker is not proof of one
  // instrument unless the listings agree. A suffixed ticker (D05.SI) names its
  // exchange, and imports default a row's currency to USD, so there the stored
  // currency proves nothing (the first price refresh corrects it).
  if (
    !ticker.includes('.') &&
    (asset.nativeCurrency !== holder.nativeCurrency ||
      (asset.exchange && holder.exchange && asset.exchange !== holder.exchange))
  )
    return `conflict: ${holder.id} (${holder.name}, ${holder.nativeCurrency} ${holder.exchange ?? '-'}) is a different listing`;
  if (!mergeDuplicates) return 'duplicate: rerun with --merge-duplicates';
  if (!apply) return `would merge into ${holder.id}`;
  await mergeAsset(tx, asset.id, holder.id);
  return `merged into ${holder.id}`;
}

/**
 * Asset deletes cascade to positions, history and trades, so every reference must
 * move to the live row first; the recount aborts the transaction rather than let a
 * missed reference be deleted. PriceHistory is left to cascade: an unpriced row
 * never had a feed worth keeping.
 */
async function mergeAsset(tx: Transaction, deadId: string, holderId: string) {
  const from = { where: { assetId: deadId }, data: { assetId: holderId } };
  await tx.position.updateMany(from);
  await tx.positionHistory.updateMany(from);
  await tx.trade.updateMany(from);
  // Snapshot rows keep no foreign key, so they would silently point at nothing.
  await tx.snapshotPosition.updateMany(from);
  const remaining = await Promise.all([
    tx.position.count({ where: { assetId: deadId } }),
    tx.positionHistory.count({ where: { assetId: deadId } }),
    tx.trade.count({ where: { assetId: deadId } }),
  ]);
  if (remaining.some((count) => count > 0))
    throw new Error(`Asset ${deadId} still has references after merge; nothing was changed`);
  await tx.asset.delete({ where: { id: deadId } });
}

import { prisma } from '../lib/prisma.js';
import { calculatePositionValue } from '../lib/domain.js';
import { AppError } from '../middleware/errorHandler.js';

type PositionData = {
  quantity: number;
  avgCostUsd: number;
  avgCostNative?: number | null;
  costCurrency?: string | null;
  recordedAvgCostUsd?: number;
  costFxRateToUsd?: number;
  costFxAsOf?: string;
  asset: { currentPriceUsd: number | null };
};

export function nativeAverage(position: Pick<PositionData, 'avgCostNative' | 'costCurrency'>) {
  return position.costCurrency && position.avgCostNative != null ? position.avgCostNative : null;
}

/** Leave stored USD costs and history intact; only the response is projected. */
export async function projectNativeCosts<T extends PositionData>(
  positions: T[]
): Promise<
  Array<
    T &
      Partial<ReturnType<typeof calculatePositionValue>> & {
        recordedAvgCostUsd?: number;
        costFxRateToUsd?: number;
        costFxAsOf?: string;
      }
  >
> {
  const currencies = [
    ...new Set(
      positions
        .filter((p) => nativeAverage(p) != null)
        .map((p) => p.costCurrency!)
        .filter((c) => c !== 'USD')
    ),
  ];
  if (!positions.some((p) => nativeAverage(p) != null)) return positions;
  const rates = currencies.length
    ? await prisma.fxRate.findMany({
        where: { fromCcy: 'USD', toCcy: { in: currencies } },
      })
    : [];
  const byCurrency = new Map(rates.map((r) => [r.toCcy, r]));
  return positions.map((position) => {
    const average = nativeAverage(position);
    if (average == null) return position;
    const fx = byCurrency.get(position.costCurrency!);
    const timestamp = position.costCurrency === 'USD' ? new Date() : fx?.timestamp;
    if (
      position.costCurrency !== 'USD' &&
      (!fx ||
        !Number.isFinite(fx.rate) ||
        fx.rate <= 0 ||
        !timestamp ||
        !Number.isFinite(timestamp.getTime()) ||
        Date.now() - timestamp.getTime() > 48 * 3600000 ||
        timestamp.getTime() - Date.now() > 300000)
    ) {
      throw new AppError(
        `A recent USD/${position.costCurrency} rate is required for native cost basis`,
        503
      );
    }
    const costFxRateToUsd = position.costCurrency === 'USD' ? 1 : 1 / fx!.rate;
    const avgCostUsd = average * costFxRateToUsd;
    if (!Number.isFinite(avgCostUsd)) throw new AppError('Invalid native cost conversion', 503);
    return {
      ...position,
      recordedAvgCostUsd: position.avgCostUsd,
      avgCostUsd,
      costFxRateToUsd,
      costFxAsOf: timestamp!.toISOString(),
      ...calculatePositionValue({
        quantity: position.quantity,
        avgCostUsd,
        currentPriceUsd: position.asset.currentPriceUsd,
      }),
    };
  });
}

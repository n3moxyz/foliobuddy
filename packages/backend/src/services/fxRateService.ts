import { usdRateEntries } from '../lib/fxConstants.js';
import { navTransaction, revalueNativeNavs } from './unitTrustNavService.js';
import type { ExchangeRates } from './providers/CoinGeckoProvider.js';
import { socketService } from './socketService.js';
import { revalueFiatCash } from './fiatCashService.js';

/** Publish FX and the corresponding native-NAV valuations together. */
export async function upsertUsdRates(rates: ExchangeRates) {
  const updated = await navTransaction(async (tx) => {
    const now = new Date();
    const updated = [];
    for (const { currency, rate } of usdRateEntries(rates)) {
      if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid FX rate');
      const timestamp = rates.sourceTimes?.[currency] ?? now;
      if (
        !Number.isFinite(timestamp.getTime()) ||
        now.getTime() - timestamp.getTime() > 48 * 3600000 ||
        timestamp.getTime() - now.getTime() > 300000
      )
        throw new Error('A recent FX quote is required');
      updated.push(
        await tx.fxRate.upsert({
          where: { fromCcy_toCcy: { fromCcy: 'USD', toCcy: currency } },
          update: { rate, timestamp },
          create: { fromCcy: 'USD', toCcy: currency, rate, timestamp },
        })
      );
    }
    await revalueNativeNavs(tx);
    await revalueFiatCash(tx);
    return updated;
  });
  socketService.broadcastPriceUpdate(0);
  return updated;
}

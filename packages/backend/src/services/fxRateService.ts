import { usdRateEntries } from '../lib/fxConstants.js';
import { navTransaction, revalueNativeNavs } from './unitTrustNavService.js';
import type { ExchangeRates } from './providers/CoinGeckoProvider.js';
import { socketService } from './socketService.js';

/** Publish FX and the corresponding native-NAV valuations together. */
export async function upsertUsdRates(rates: ExchangeRates) {
  const updated = await navTransaction(async (tx) => {
    const now = new Date();
    const updated = [];
    for (const { currency, rate } of usdRateEntries(rates)) {
      if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid FX rate');
      updated.push(
        await tx.fxRate.upsert({
          where: { fromCcy_toCcy: { fromCcy: 'USD', toCcy: currency } },
          update: { rate, timestamp: now },
          create: { fromCcy: 'USD', toCcy: currency, rate, timestamp: now },
        })
      );
    }
    await revalueNativeNavs(tx);
    return updated;
  });
  socketService.broadcastPriceUpdate(0);
  return updated;
}

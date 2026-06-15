import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { priceService } from '../services/priceService.js';
import { AppError } from '../middleware/errorHandler.js';
import type { ExchangeRates } from '../services/providers/CoinGeckoProvider.js';

const router = Router();
const USD_RATE_FIELDS = [
  { currency: 'SGD', field: 'usdSgd' },
  { currency: 'JPY', field: 'usdJpy' },
  { currency: 'TWD', field: 'usdTwd' },
  { currency: 'KRW', field: 'usdKrw' },
] as const;
type UsdRateCurrency = (typeof USD_RATE_FIELDS)[number]['currency'];
type UsdRateEntry = { currency: UsdRateCurrency; rate: number };

function usdRateEntries(rates: ExchangeRates): UsdRateEntry[] {
  const entries: UsdRateEntry[] = [];
  for (const { currency, field } of USD_RATE_FIELDS) {
    const rate = rates[field];
    if (rate) entries.push({ currency, rate });
  }
  return entries;
}

async function upsertUsdRates(rates: ExchangeRates) {
  const now = new Date();
  return Promise.all(
    usdRateEntries(rates).map(({ currency, rate }) =>
      prisma.fxRate.upsert({
        where: {
          fromCcy_toCcy: {
            fromCcy: 'USD',
            toCcy: currency,
          },
        },
        update: {
          rate,
          timestamp: now,
        },
        create: {
          fromCcy: 'USD',
          toCcy: currency,
          rate,
        },
      })
    )
  );
}

function hasRequiredUsdRates(rates: Array<{ fromCcy: string; toCcy: string }>) {
  return USD_RATE_FIELDS.every(({ currency }) =>
    rates.some((rate) => rate.fromCcy === 'USD' && rate.toCcy === currency)
  );
}

// GET /api/fx/rates - Get current FX rates
router.get('/rates', async (req, res, next) => {
  try {
    let rates = await prisma.fxRate.findMany();

    // If required rates are missing, fetch fresh
    if (!hasRequiredUsdRates(rates)) {
      const freshRates = await priceService.getExchangeRates();

      if (freshRates) {
        await upsertUsdRates(freshRates);
        rates = await prisma.fxRate.findMany();
      }
    }

    res.json(rates);
  } catch (error) {
    next(error);
  }
});

// GET /api/fx/convert - Convert an amount between currencies
router.get('/convert', async (req, res, next) => {
  try {
    const { amount, from, to } = req.query;

    if (!amount || !from || !to) {
      throw new AppError('amount, from, and to parameters are required', 400);
    }

    const amountNum = parseFloat(amount as string);

    if (isNaN(amountNum)) {
      throw new AppError('Invalid amount', 400);
    }

    // FX table stores USD base pairs; inverse conversion is derived when needed.
    const fromUpper = (from as string).toUpperCase();
    const toUpper = (to as string).toUpperCase();

    if (fromUpper === toUpper) {
      return res.json({
        amount: amountNum,
        from: fromUpper,
        to: toUpper,
        converted: amountNum,
        rate: 1,
      });
    }

    let rate = await prisma.fxRate.findUnique({
      where: {
        fromCcy_toCcy: {
          fromCcy: fromUpper,
          toCcy: toUpper,
        },
      },
    });

    // Try inverse rate
    if (!rate) {
      const inverseRate = await prisma.fxRate.findUnique({
        where: {
          fromCcy_toCcy: {
            fromCcy: toUpper,
            toCcy: fromUpper,
          },
        },
      });

      if (inverseRate) {
        rate = {
          ...inverseRate,
          fromCcy: fromUpper,
          toCcy: toUpper,
          rate: 1 / inverseRate.rate,
        };
      }
    }

    if (!rate && (fromUpper === 'USD' || toUpper === 'USD')) {
      const freshRates = await priceService.getExchangeRates();

      if (freshRates) {
        const directFreshRate = usdRateEntries(freshRates).find(
          (entry) => fromUpper === 'USD' && toUpper === entry.currency
        );
        const inverseFreshRate = usdRateEntries(freshRates).find(
          (entry) => fromUpper === entry.currency && toUpper === 'USD'
        );

        if (directFreshRate) {
          rate = {
            id: 'temp',
            fromCcy: 'USD',
            toCcy: directFreshRate.currency,
            rate: directFreshRate.rate,
            timestamp: new Date(),
          };
        } else if (inverseFreshRate) {
          rate = {
            id: 'temp',
            fromCcy: inverseFreshRate.currency,
            toCcy: 'USD',
            rate: 1 / inverseFreshRate.rate,
            timestamp: new Date(),
          };
        }
      }
    }

    if (!rate) {
      throw new AppError(`Exchange rate for ${fromUpper}/${toUpper} not found`, 404);
    }

    const converted = amountNum * rate.rate;

    res.json({
      amount: amountNum,
      from: fromUpper,
      to: toUpper,
      converted,
      rate: rate.rate,
      timestamp: rate.timestamp,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/fx/refresh - Refresh FX rates
router.post('/refresh', async (req, res, next) => {
  try {
    const freshRates = await priceService.getExchangeRates();

    if (!freshRates) {
      throw new AppError('Failed to fetch exchange rates', 502);
    }

    const rates = await upsertUsdRates(freshRates);

    res.json({
      message: 'FX rates refreshed',
      rates,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

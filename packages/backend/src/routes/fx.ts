import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { priceService } from '../services/priceService.js';
import { AppError } from '../middleware/errorHandler.js';
import { ensureUser } from '../middleware/auth.js';
import { USD_RATE_FIELDS, usdRateEntries } from '../lib/fxConstants.js';
import type { ExchangeRates } from '../services/providers/CoinGeckoProvider.js';

const router = Router();

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

    if (amount === undefined || from === undefined || to === undefined) {
      throw new AppError('amount, from, and to parameters are required', 400);
    }

    if (
      typeof amount !== 'string' ||
      amount.trim() === '' ||
      typeof from !== 'string' ||
      typeof to !== 'string'
    ) {
      throw new AppError('Invalid currency conversion parameters', 400);
    }

    const amountNum = Number(amount);

    if (!Number.isFinite(amountNum)) {
      throw new AppError('Invalid amount', 400);
    }

    // FX table stores USD base pairs; inverse conversion is derived when needed.
    const fromUpper = from.toUpperCase();
    const toUpper = to.toUpperCase();

    if (!/^[A-Z]{3}$/.test(fromUpper) || !/^[A-Z]{3}$/.test(toUpper)) {
      throw new AppError('Currencies must be three-letter codes', 400);
    }

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

    if (rate && (!Number.isFinite(rate.rate) || rate.rate <= 0)) {
      throw new AppError('Stored exchange rate is invalid', 502);
    }

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
        if (!Number.isFinite(inverseRate.rate) || inverseRate.rate <= 0) {
          throw new AppError('Stored exchange rate is invalid', 502);
        }
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

    if (!Number.isFinite(converted)) {
      throw new AppError('Conversion result is outside the supported range', 400);
    }

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

// POST /api/fx/refresh - Refresh FX rates (auth required; GET /rates stays public so
// the frontend can load rates before Clerk auth resolves).
router.post('/refresh', ensureUser, async (req, res, next) => {
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

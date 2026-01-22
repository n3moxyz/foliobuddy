import { Router } from 'express';
import { prisma } from '../index.js';
import { priceService } from '../services/priceService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/fx/rates - Get current FX rates
router.get('/rates', async (req, res, next) => {
  try {
    const rates = await prisma.fxRate.findMany();

    // If no rates in DB, fetch fresh
    if (rates.length === 0) {
      const freshRates = await priceService.getExchangeRates();

      if (freshRates) {
        const usdSgd = await prisma.fxRate.create({
          data: {
            fromCcy: 'USD',
            toCcy: 'SGD',
            rate: freshRates.usdSgd,
          },
        });
        rates.push(usdSgd);
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

    // For now, we only support USD <-> SGD
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

    // Fetch fresh rate if not found
    if (!rate && (fromUpper === 'USD' || toUpper === 'USD')) {
      const freshRates = await priceService.getExchangeRates();

      if (freshRates) {
        if (fromUpper === 'USD' && toUpper === 'SGD') {
          rate = {
            id: 'temp',
            fromCcy: 'USD',
            toCcy: 'SGD',
            rate: freshRates.usdSgd,
            timestamp: new Date(),
          };
        } else if (fromUpper === 'SGD' && toUpper === 'USD') {
          rate = {
            id: 'temp',
            fromCcy: 'SGD',
            toCcy: 'USD',
            rate: 1 / freshRates.usdSgd,
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

    const usdSgd = await prisma.fxRate.upsert({
      where: {
        fromCcy_toCcy: {
          fromCcy: 'USD',
          toCcy: 'SGD',
        },
      },
      update: {
        rate: freshRates.usdSgd,
        timestamp: new Date(),
      },
      create: {
        fromCcy: 'USD',
        toCcy: 'SGD',
        rate: freshRates.usdSgd,
      },
    });

    res.json({
      message: 'FX rates refreshed',
      rates: [usdSgd],
    });
  } catch (error) {
    next(error);
  }
});

export default router;

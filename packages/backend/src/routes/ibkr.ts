import { Router } from 'express';
import { z } from 'zod';
import { ibkrRuns, reconcileIbkr, restoreIbkr } from '../services/ibkrSyncService.js';
import { navTransaction } from '../services/unitTrustNavService.js';
import { requireIbkr, isIbkrCash } from '../services/ibkrCapture.js';
import { ibkrDeviceOwnerRouter } from './ibkrDevice.js';
import { ibkrHelperOwnerRouter } from './ibkrHelper.js';

const router = Router();
router.use('/devices', ibkrDeviceOwnerRouter);
router.use('/helper-permits', ibkrHelperOwnerRouter);
const request = z
  .object({
    action: z.enum(['preview', 'apply']),
    kind: z.enum(['sync', 'cash']),
    cashPositionId: z.string().min(1).max(100),
    input: z.unknown(),
    expectedState: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === 'apply' && !data.expectedState)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Preview state is required',
        path: ['expectedState'],
      });
  });
router.get('/runs', async (req, res, next) => {
  try {
    res.json(await ibkrRuns(req.userId!));
  } catch (error) {
    next(error);
  }
});
router.post('/cash-position', async (req, res, next) => {
  try {
    const position = await navTransaction(async (tx) => {
      const existing = await tx.position.findMany({
        where: {
          userId: req.userId!,
          custodyOf: null,
          storageType: 'BROKERAGE',
          storageLocation: 'IBKR',
          asset: { category: 'CASH' },
        },
        include: { asset: true },
      });
      requireIbkr(existing.length <= 1, 'Multiple IBKR cash records need review');
      if (existing.length) {
        requireIbkr(
          isIbkrCash(existing[0]) && existing[0].asset.symbol === 'USD',
          'IBKR currency balances need the USD account record'
        );
        return existing[0];
      }
      const assets = await tx.asset.findMany({
        where: {
          symbol: 'USD',
          category: 'CASH',
          nativeCurrency: 'USD',
          priceProvider: 'manual',
          currentPriceUsd: 1,
        },
      });
      requireIbkr(assets.length <= 1, 'Multiple USD cash identities need review');
      const asset =
        assets[0] ??
        (await tx.asset.create({
          data: {
            symbol: 'USD',
            name: 'US Dollar',
            category: 'CASH',
            nativeCurrency: 'USD',
            priceProvider: 'manual',
            currentPriceUsd: 1,
          },
        }));
      return tx.position.create({
        data: {
          userId: req.userId!,
          assetId: asset.id,
          quantity: 0,
          avgCostUsd: 1,
          storageType: 'BROKERAGE',
          storageLocation: 'IBKR',
          marketValueUsd: 0,
          unrealizedPnL: 0,
          unrealizedPnLPct: 0,
        },
        include: { asset: true },
      });
    });
    res.json(position);
  } catch (error) {
    next(error);
  }
});
router.post('/reconcile', async (req, res, next) => {
  try {
    const { action, ...data } = request.parse(req.body);
    res.json(
      await reconcileIbkr(req.userId!, {
        ...data,
        input: data.input,
        expectedState: action === 'apply' ? data.expectedState : undefined,
      })
    );
  } catch (error) {
    next(error);
  }
});
router.post('/restore', async (req, res, next) => {
  try {
    const data = z
      .object({ action: z.enum(['preview', 'apply']), runId: z.string().min(1).max(100) })
      .parse(req.body);
    res.json(await restoreIbkr(req.userId!, data.runId, data.action === 'apply'));
  } catch (error) {
    next(error);
  }
});
export default router;

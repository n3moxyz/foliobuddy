import { Router } from 'express';
import { z } from 'zod';
import {
  enrollIbkrDevice,
  ibkrDeviceRequest,
  listIbkrDevices,
  revokeIbkrDevice,
} from '../services/ibkrDeviceService.js';

/** Mounted below /ibkr only after the existing Clerk owner middleware. */
export const ibkrDeviceOwnerRouter = Router();
ibkrDeviceOwnerRouter.get('/', async (req, res, next) => {
  try {
    const query = z
      .object({ cashPositionId: z.string().min(1).max(100).optional() })
      .strict()
      .parse(req.query);
    res.json(await listIbkrDevices(req.userId!, query.cashPositionId));
  } catch (error) {
    next(error);
  }
});
ibkrDeviceOwnerRouter.post('/', async (req, res, next) => {
  try {
    const input = z
      .object({ cashPositionId: z.string().min(1).max(100), enrollment: z.unknown() })
      .strict()
      .parse(req.body);
    res
      .status(201)
      .json(await enrollIbkrDevice(req.userId!, input.cashPositionId, input.enrollment));
  } catch (error) {
    next(error);
  }
});
ibkrDeviceOwnerRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    res.json(await revokeIbkrDevice(req.userId!, id));
  } catch (error) {
    next(error);
  }
});

/** No owner-auth fallback, manual correction, generic mutation or restore route. */
const router = Router();
for (const operation of ['status', 'preview', 'apply', 'readback', 'complete', 'failure']) {
  router.post(`/${operation}`, async (req, res, next) => {
    try {
      res.json(
        await ibkrDeviceRequest({
          method: req.method,
          path: req.originalUrl,
          headers: req.headers,
          body: req.body,
        })
      );
    } catch (error) {
      next(error);
    }
  });
}
export default router;

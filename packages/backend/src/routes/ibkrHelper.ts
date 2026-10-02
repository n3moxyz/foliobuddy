import { Router, type ErrorRequestHandler, type Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import {
  consumeIbkrHelperPermit,
  issueIbkrHelperPermit,
} from '../services/ibkrHelperPermitService.js';
import { ibkrHelperConsumeSchema, ibkrHelperPermitSchema } from '../services/ibkrHelperAuth.js';

function failed(error: unknown, response: Response) {
  const malformed =
    error && typeof error === 'object' && 'type' in error && error.type === 'entity.parse.failed';
  const status =
    error instanceof ZodError || malformed
      ? 400
      : error instanceof AppError
        ? error.statusCode
        : 503;
  return response.status(status).json({ error: 'IBKR helper authorization is unavailable' });
}
// Body-parser errors contain the original request body. These routes must never
// forward any error to the ordinary logger, even before the route handler runs.
export const ibkrHelperErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  failed(error, res);
};

/** Mounted under /ibkr only after Clerk ensureUser; agent API keys never enter. */
export const ibkrHelperOwnerRouter = Router();
ibkrHelperOwnerRouter.post('/', async (req, res) => {
  try {
    const scope = ibkrHelperPermitSchema.parse(req.body);
    res.status(201).json(await issueIbkrHelperPermit(req.userId!, scope));
  } catch (error) {
    failed(error, res);
  }
});

const router = Router();
router.post('/consume', async (req, res) => {
  try {
    const input = ibkrHelperConsumeSchema.parse(req.body);
    res.json({ data: await consumeIbkrHelperPermit(input) });
  } catch (error) {
    failed(error, res);
  }
});
export default router;

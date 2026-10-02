import { z } from 'zod';

const randomId = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const fields = {
  cashPositionId: z.string().min(1).max(100),
  challenge: randomId,
  connectorFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  operation: z.enum(['pair', 'capture', 'checkpoint', 'verify', 'finish']),
  jobId: randomId.nullable(),
};
const scope = z.object(fields).strict();
export type IbkrHelperScope = z.infer<typeof scope>;
const validateJob = (value: IbkrHelperScope, context: z.RefinementCtx) => {
  const requiresJob = !['pair', 'capture'].includes(value.operation);
  if (requiresJob !== (value.jobId !== null))
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Invalid operation job scope',
      path: ['jobId'],
    });
};
export const ibkrHelperPermitSchema = scope.superRefine(validateJob);
export const ibkrHelperConsumeSchema = z
  .object({ ...fields, permit: randomId })
  .strict()
  .superRefine(validateJob);

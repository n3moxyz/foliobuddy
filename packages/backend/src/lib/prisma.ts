import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

// Transient error codes that are safe to retry
const RETRYABLE_ERRORS = new Set([
  'P1001', // Can't reach database server
  'P1008', // Operations timed out
  'P1017', // Server has closed the connection
  'P2024', // Timed out fetching a new connection from the pool
]);

function isRetryable(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    return RETRYABLE_ERRORS.has((error as { code: string }).code);
  }
  // Also retry on generic connection reset errors
  const msg = error instanceof Error ? error.message : '';
  return msg.includes('ECONNRESET') || msg.includes('Connection refused');
}

export const basePrisma = new PrismaClient();

export const prisma = basePrisma.$extends({
  query: {
    $allOperations: async ({ args, query }) => {
      const MAX_RETRIES = 3;
      const BASE_DELAY = 500; // ms

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          return await query(args);
        } catch (error) {
          if (attempt < MAX_RETRIES - 1 && isRetryable(error)) {
            const delay = BASE_DELAY * Math.pow(2, attempt); // 500, 1000, 2000
            logger.warn(
              `[Prisma Retry] Attempt ${attempt + 1}/${MAX_RETRIES} failed (${(error as { code?: string })?.code || 'unknown'}), retrying in ${delay}ms...`
            );
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          throw error;
        }
      }
      // Unreachable, but TypeScript needs it
      throw new Error('Retry loop exited unexpectedly');
    },
  },
});

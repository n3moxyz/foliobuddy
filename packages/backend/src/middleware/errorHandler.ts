import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { Sentry } from '../lib/sentry.js';
import { logger } from '../lib/logger.js';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Client-facing text for known Prisma codes; the raw messages name tables,
// columns and constraints, so they never reach a response.
const PRISMA_ERROR_MESSAGES: Record<string, string> = {
  P2002: 'A record with this value already exists',
  P2025: 'Record not found',
  // Serializable transactions (investor + linked cash-pile mutations) abort
  // instead of silently overwriting a concurrent change. Safe to retry.
  P2034: 'This change collided with another update. Please retry.',
};

function isPrismaKnownError(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  const PrismaClientKnownRequestError = Prisma.PrismaClientKnownRequestError;
  return (
    typeof PrismaClientKnownRequestError === 'function' &&
    err instanceof PrismaClientKnownRequestError
  );
}

/**
 * Per-row error text for bulk responses, which report failures inside a 2xx body
 * instead of reaching errorHandler: AppError messages pass through; database and
 * runtime errors become fixed text, never their raw message.
 */
export function userSafeErrorMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (isPrismaKnownError(err)) return PRISMA_ERROR_MESSAGES[err.code] ?? 'Database error';
  return 'Unexpected error';
}

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  logger.error('Error:', err);

  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation error',
      details: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // Prisma errors
  if (isPrismaKnownError(err)) {
    switch (err.code) {
      case 'P2002':
        return res.status(409).json({
          error: PRISMA_ERROR_MESSAGES.P2002,
          field: (err.meta?.target as string[])?.join(', '),
        });
      case 'P2025':
        return res.status(404).json({
          error: PRISMA_ERROR_MESSAGES.P2025,
        });
      case 'P2034':
        return res.status(409).json({
          error: PRISMA_ERROR_MESSAGES.P2034,
        });
      default:
        return res.status(400).json({
          error: 'Database error',
          code: err.code,
        });
    }
  }

  // Custom AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
    });
  }

  // Capture unexpected errors in Sentry (skip expected 4xx errors)
  if (!(err instanceof AppError && err.statusCode < 500)) {
    Sentry.captureException(err);
  }

  // Unknown errors
  return res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
}

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { PrismaClient } from '@prisma/client';
import positionsRouter from './routes/positions.js';
import assetsRouter from './routes/assets.js';
import tradesRouter from './routes/trades.js';
import investorsRouter from './routes/investors.js';
import snapshotsRouter from './routes/snapshots.js';
import pricesRouter from './routes/prices.js';
import fxRouter from './routes/fx.js';
import exportRouter from './routes/export.js';
import healthRouter from './routes/health.js';
import { errorHandler } from './middleware/errorHandler.js';
import { clerkMiddleware, ensureUser } from './middleware/auth.js';
import { startPriceRefreshJob, startSnapshotJob, startFxRateJob, createMissingSnapshots } from './services/scheduler.js';
import { socketService } from './services/socketService.js';
import { logger } from './lib/logger.js';
import { MAX_PAYLOAD_SIZE, RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS } from './lib/constants.js';

import { initSentry } from './lib/sentry.js';

// Load .env from packages/backend directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Initialize Sentry before Express so it can auto-instrument
initSentry();

const app = express();
const server = createServer(app);
const port = process.env.PORT || 4001;

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

// Initialize Prisma client with retry extension
const basePrisma = new PrismaClient();

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
              `[Prisma Retry] Attempt ${attempt + 1}/${MAX_RETRIES} failed (${(error as any)?.code || 'unknown'}), retrying in ${delay}ms...`
            );
            await new Promise(r => setTimeout(r, delay));
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

// Database connection with retry logic
async function connectWithRetry(maxRetries = 5, delayMs = 5000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await basePrisma.$connect();
      logger.info('Database connected successfully');
      return true;
    } catch (error) {
      logger.warn(`Database connection attempt ${attempt}/${maxRetries} failed:`, error instanceof Error ? error.message : error);
      if (attempt < maxRetries) {
        logger.info(`Retrying in ${delayMs / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  return false;
}

// CORS allowed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    // Use exact matching to prevent subdomain attacks (e.g., evil-example.com matching example.com)
    // Only allow wildcard (*) as an explicit entry
    if (allowedOrigins.some(allowed => origin === allowed || allowed === '*')) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: MAX_PAYLOAD_SIZE }));

// Rate limiting
const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api', limiter);

// Clerk authentication middleware
app.use(clerkMiddleware());

// Health check (public)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Database health check (public, no auth)
app.use('/api/health', healthRouter);

// API Routes (protected - require authentication)
app.use('/api/positions', ensureUser, positionsRouter);
app.use('/api/assets', assetsRouter); // Assets are shared, no auth needed
app.use('/api/trades', ensureUser, tradesRouter);
app.use('/api/investors', ensureUser, investorsRouter);
app.use('/api/snapshots', ensureUser, snapshotsRouter);
app.use('/api/prices', pricesRouter); // Prices are shared, no auth needed
app.use('/api/fx', fxRouter); // FX rates are shared, no auth needed
app.use('/api/export', ensureUser, exportRouter);

// Error handling middleware
app.use(errorHandler);

// Graceful shutdown
process.on('SIGINT', async () => {
  await basePrisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await basePrisma.$disconnect();
  process.exit(0);
});

// Initialize Socket.io
socketService.initialize(server, allowedOrigins);

// Start server with database connection retry
async function startServer() {
  // Connect to database with retry logic
  const connected = await connectWithRetry(10, 3000);
  if (!connected) {
    logger.error('Failed to connect to database after multiple attempts. Exiting...');
    process.exit(1);
  }

  server.listen(port, async () => {
    logger.info(`Server running on http://localhost:${port}`);
    logger.info(`API available at http://localhost:${port}/api`);
    logger.info('WebSocket server ready');

    // Drop the unique constraint on Position table to allow duplicate positions
    try {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "Position" DROP CONSTRAINT IF EXISTS "Position_userId_assetId_storageType_storageLocation_key"
      `);
      logger.info('Position unique constraint dropped (if it existed)');
    } catch (error) {
      logger.warn('Could not drop Position constraint (may already be gone):', error);
    }

    // Start scheduled jobs only in production
    // In dev, the production backend (Coolify) handles price refresh, snapshots, and crons
    // against the shared DB — running them locally would duplicate work and risk race conditions
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      startPriceRefreshJob();
      startSnapshotJob();
      startFxRateJob();

      // Create missing snapshots on startup (catch-up for days server wasn't running)
      // Delay slightly to ensure database connection is ready
      setTimeout(() => {
        createMissingSnapshots();
      }, 2000);
    } else {
      logger.info('Skipping schedulers in dev (prod handles crons)');
    }
  });
}

startServer();

export { server };
export default app;

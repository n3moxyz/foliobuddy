import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { prisma, basePrisma } from './lib/prisma.js';
import positionsRouter from './routes/positions.js';
import assetsRouter from './routes/assets.js';
import tradesRouter from './routes/trades.js';
import investorsRouter from './routes/investors.js';
import snapshotsRouter from './routes/snapshots.js';
import pricesRouter from './routes/prices.js';
import fxRouter from './routes/fx.js';
import exportRouter from './routes/export.js';
import agentRouter from './routes/agent.js';
import healthRouter from './routes/health.js';
import { errorHandler } from './middleware/errorHandler.js';
import { clerkMiddleware, ensureUser } from './middleware/auth.js';
import { agentAuth } from './middleware/agentAuth.js';
import {
  startPriceRefreshJob,
  startSnapshotJob,
  startFxRateJob,
  startPriceHistoryCleanupJob,
  createMissingSnapshots,
} from './services/scheduler.js';
import { socketService } from './services/socketService.js';
import { logger } from './lib/logger.js';
import {
  MAX_PAYLOAD_SIZE,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
} from './lib/constants.js';

import { initSentry } from './lib/sentry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

initSentry();

const app = express();
const server = createServer(app);
const port = process.env.PORT || 4001;

async function connectWithRetry(maxRetries = 5, delayMs = 5000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await basePrisma.$connect();
      logger.info('Database connected successfully');
      return true;
    } catch (error) {
      logger.warn(
        `Database connection attempt ${attempt}/${maxRetries} failed:`,
        error instanceof Error ? error.message : error
      );
      if (attempt < maxRetries) {
        logger.info(`Retrying in ${delayMs / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  return false;
}

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      // Exact matching prevents subdomain attacks (e.g., evil-example.com matching example.com)
      if (allowedOrigins.some((allowed) => origin === allowed || allowed === '*')) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: MAX_PAYLOAD_SIZE }));

const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use('/api', limiter);

app.use(clerkMiddleware());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/health', healthRouter);

const v1Router = express.Router();

v1Router.use('/health', healthRouter);
v1Router.use('/positions', ensureUser, positionsRouter);
v1Router.use('/assets', assetsRouter);
v1Router.use('/trades', ensureUser, tradesRouter);
v1Router.use('/investors', ensureUser, investorsRouter);
v1Router.use('/snapshots', ensureUser, snapshotsRouter);
v1Router.use('/prices', pricesRouter);
v1Router.use('/fx', fxRouter);
v1Router.use('/export', ensureUser, exportRouter);
v1Router.use('/agent', agentAuth, agentRouter);

app.use('/api/v1', v1Router);

app.use(errorHandler);

process.on('SIGINT', async () => {
  await basePrisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await basePrisma.$disconnect();
  process.exit(0);
});

socketService.initialize(server, allowedOrigins);

async function startServer() {
  const connected = await connectWithRetry(10, 3000);
  if (!connected) {
    logger.error('Failed to connect to database after multiple attempts. Exiting...');
    process.exit(1);
  }

  server.listen(port, async () => {
    logger.info(`Server running on http://localhost:${port}`);
    logger.info(`API available at http://localhost:${port}/api/v1`);
    logger.info('WebSocket server ready');

    // Schedulers run only in production — in dev, the Coolify backend handles crons against
    // the shared DB. Running them locally would duplicate work and risk race conditions.
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      startPriceRefreshJob();
      startSnapshotJob();
      startFxRateJob();
      startPriceHistoryCleanupJob();

      // Delay slightly to ensure DB connection is settled before catch-up runs
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

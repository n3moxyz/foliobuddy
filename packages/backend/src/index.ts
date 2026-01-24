import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import positionsRouter from './routes/positions.js';
import assetsRouter from './routes/assets.js';
import tradesRouter from './routes/trades.js';
import investorsRouter from './routes/investors.js';
import snapshotsRouter from './routes/snapshots.js';
import pricesRouter from './routes/prices.js';
import fxRouter from './routes/fx.js';
import exportRouter from './routes/export.js';
import { errorHandler } from './middleware/errorHandler.js';
import { clerkMiddleware, ensureUser } from './middleware/auth.js';
import { startPriceRefreshJob, startSnapshotJob, createMissingSnapshots } from './services/scheduler.js';

// Load .env from packages/backend directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const port = process.env.PORT || 3001;

// Initialize Prisma client
export const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());

// Clerk authentication middleware
app.use(clerkMiddleware());

// Health check (public)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`📊 API available at http://localhost:${port}/api`);

  // Start scheduled jobs
  if (process.env.NODE_ENV !== 'test') {
    startPriceRefreshJob();
    startSnapshotJob();

    // Create missing snapshots on startup (catch-up for days server wasn't running)
    // Delay slightly to ensure database connection is ready
    setTimeout(() => {
      createMissingSnapshots();
    }, 2000);
  }
});

export default app;

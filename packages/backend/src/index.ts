import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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
import { startPriceRefreshJob, startSnapshotJob } from './services/scheduler.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Initialize Prisma client
export const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/positions', positionsRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/trades', tradesRouter);
app.use('/api/investors', investorsRouter);
app.use('/api/snapshots', snapshotsRouter);
app.use('/api/prices', pricesRouter);
app.use('/api/fx', fxRouter);
app.use('/api/export', exportRouter);

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
  }
});

export default app;

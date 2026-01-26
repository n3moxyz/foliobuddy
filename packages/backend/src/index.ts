import express from 'express';
import cors from 'cors';
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
import { errorHandler } from './middleware/errorHandler.js';
import { clerkMiddleware, ensureUser } from './middleware/auth.js';
import { startPriceRefreshJob, startSnapshotJob, createMissingSnapshots } from './services/scheduler.js';
import { socketService } from './services/socketService.js';

// Load .env from packages/backend directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const server = createServer(app);
const port = process.env.PORT || 3001;

// Initialize Prisma client
export const prisma = new PrismaClient();

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

// Initialize Socket.io
socketService.initialize(server, allowedOrigins);

// Start server
server.listen(port, async () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`📊 API available at http://localhost:${port}/api`);
  console.log(`🔌 WebSocket server ready`);

  // Drop the unique constraint on Position table to allow duplicate positions
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Position" DROP CONSTRAINT IF EXISTS "Position_userId_assetId_storageType_storageLocation_key"
    `);
    console.log('✓ Position unique constraint dropped (if it existed)');
  } catch (error) {
    console.log('Note: Could not drop Position constraint (may already be gone):', error);
  }

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

export { server };
export default app;

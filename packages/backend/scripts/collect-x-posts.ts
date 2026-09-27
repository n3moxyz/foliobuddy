/**
 * One X collection pass into the database in DATABASE_URL. Schedulers run only
 * in production, so this is how a local database gets posts to look at.
 * Reads TWITTERAPI_IO_KEY and X_NEWS_SOURCES from the environment or .env.
 *
 *   npm run news:collect-x -- --days 3
 */
import dotenv from 'dotenv';
dotenv.config();
const { xPostCollector, DEFAULT_CATCH_UP_DAYS, MAX_CATCH_UP_DAYS } =
  await import('../src/services/news/xCollector.js');
const { prisma } = await import('../src/lib/prisma.js');
const { logger } = await import('../src/lib/logger.js');

function catchUpDays(): number {
  const index = process.argv.indexOf('--days');
  if (index === -1) return DEFAULT_CATCH_UP_DAYS;
  const days = Number(process.argv[index + 1]);
  if (!Number.isInteger(days) || days < 1 || days > MAX_CATCH_UP_DAYS) {
    throw new Error(`--days must be a whole number from 1 to ${MAX_CATCH_UP_DAYS}`);
  }
  return days;
}

try {
  const result = await xPostCollector.collect({ catchUpDays: catchUpDays() });
  logger.info('[XPosts] Collection result', result);
  if (result.status !== 'ok' || result.failedBatches > 0) process.exitCode = 1;
} catch (error) {
  logger.error('[XPosts] Collection failed', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

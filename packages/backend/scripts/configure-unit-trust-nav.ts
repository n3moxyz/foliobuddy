/** Run with an explicitly configured DATABASE_URL. Dry-run unless --apply. */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const { configureKnownUnitTrusts } = await import('../src/services/unitTrustNavService.js');
const { priceService } = await import('../src/services/priceService.js');
const { prisma } = await import('../src/lib/prisma.js');
const { logger } = await import('../src/lib/logger.js');
try {
  const apply = process.argv.includes('--apply');
  const mapping = await configureKnownUnitTrusts(apply);
  logger.info('[Daily NAV mapping]', mapping);
  if (mapping.some((change) => change.action.startsWith('conflict:'))) process.exitCode = 1;
  if (apply) {
    const result = await priceService.refreshAllPrices('fund-manager');
    logger.info('[Daily NAV refresh]', result);
    if (result.errors) process.exitCode = 1;
  }
} catch (error) {
  logger.error('[Daily NAV migration failed]', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

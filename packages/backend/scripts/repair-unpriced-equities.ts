/** Run with an explicitly configured DATABASE_URL. Dry-run unless --apply; --merge-duplicates folds a dead row into the live Yahoo row that already holds its ticker. */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const { repairUnpricedEquities } = await import('../src/services/catalogRepair.js');
const { prisma } = await import('../src/lib/prisma.js');
const { logger } = await import('../src/lib/logger.js');
try {
  const apply = process.argv.includes('--apply');
  const mergeDuplicates = process.argv.includes('--merge-duplicates');
  const changes = await repairUnpricedEquities({ apply, mergeDuplicates });
  logger.info('[Unpriced equity repair]', changes);
  if (
    changes.some(({ action }) => action.startsWith('conflict:') || action.startsWith('duplicate:'))
  )
    process.exitCode = 1;
} catch (error) {
  logger.error('[Unpriced equity repair failed]', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

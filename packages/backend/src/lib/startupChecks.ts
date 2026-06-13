import { logger } from './logger.js';

function hasConfiguredAdminUsers(): boolean {
  return (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .some(Boolean);
}

export function warnOnMissingProductionConfig(): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (hasConfiguredAdminUsers()) return;

  logger.warn(
    'ADMIN_USER_IDS is not configured. Admin-only asset catalog routes ' +
      '(PUT/DELETE /api/v1/assets/:id) will return 403 for every user.'
  );
}

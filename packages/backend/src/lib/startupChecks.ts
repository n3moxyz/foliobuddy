import { logger } from './logger.js';

function hasConfiguredAdminUsers(): boolean {
  return (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .some(Boolean);
}

export function warnOnMissingProductionConfig(): void {
  if (process.env.NODE_ENV !== 'production') return;

  // Access gating lives entirely in Clerk (Access mode = Waitlist/Invite-only).
  // ensureUser auto-creates a User row for anyone Clerk authenticates, so if the
  // Clerk instance is ever switched back to "Open", sign-ups are unrestricted.
  // There is deliberately no second allowlist here — one source of truth — but
  // this reminder makes the dependency visible in every production boot log.
  logger.info(
    'Access gating relies on the Clerk instance Access mode (Waitlist/Invite-only). ' +
      'The backend auto-creates users for any Clerk-authenticated identity.'
  );

  if (hasConfiguredAdminUsers()) return;

  logger.warn(
    'ADMIN_USER_IDS is not configured. Admin-only asset catalog routes ' +
      '(PUT/DELETE /api/v1/assets/:id) will return 403 for every user.'
  );
}

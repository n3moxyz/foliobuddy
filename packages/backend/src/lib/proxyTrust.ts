import type { Express } from 'express';

/** Trust only configured proxy networks, then stop at the first untrusted address. */
export function configureProxyTrust(app: Express, cidrs?: string): void {
  app.set('trust proxy', cidrs?.trim() ? cidrs.split(',').map((value) => value.trim()) : false);
}

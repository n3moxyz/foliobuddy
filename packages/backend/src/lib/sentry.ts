import * as Sentry from '@sentry/node';
import { logger } from './logger.js';

// Hosts whose request URLs carry private data: an X search names every roster
// handle (X_NEWS_SOURCES) in its query string, which Sentry would otherwise
// copy onto fetch breadcrumbs and tracing spans.
const UNRECORDED_FETCH_HOSTS = new Set(['api.twitterapi.io']);

export function isUnrecordedFetch(url: string): boolean {
  try {
    return UNRECORDED_FETCH_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    logger.info('Sentry DSN not configured — skipping initialization');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    // Replaces the default fetch integration (same name) with one that skips them.
    integrations: [
      Sentry.nativeNodeFetchIntegration({ ignoreOutgoingRequests: isUnrecordedFetch }),
    ],
  });

  logger.info('Sentry initialized');
}

export { Sentry };

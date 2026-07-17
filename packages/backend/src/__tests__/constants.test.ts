import { describe, expect, it } from 'vitest';
import {
  ASSET_CATEGORIES,
  DEFAULT_SNAPSHOT_LIMIT,
  MAX_HISTORICAL_DAYS,
  MAX_PAYLOAD_SIZE,
  MAX_POSITIONS_PER_CATEGORY,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
  STORAGE_TYPES,
  TRADE_DIRECTIONS,
  TRADE_STATUSES,
  USD_SGD_FALLBACK_RATE,
} from '../lib/constants.js';

describe('operational constants', () => {
  it('preserves the deliberate request and collection safety limits', () => {
    expect({
      MAX_POSITIONS_PER_CATEGORY,
      DEFAULT_SNAPSHOT_LIMIT,
      MAX_HISTORICAL_DAYS,
      MAX_PAYLOAD_SIZE,
      RATE_LIMIT_WINDOW_MS,
      RATE_LIMIT_MAX_REQUESTS,
    }).toEqual({
      MAX_POSITIONS_PER_CATEGORY: 20,
      DEFAULT_SNAPSHOT_LIMIT: 100,
      MAX_HISTORICAL_DAYS: 365,
      MAX_PAYLOAD_SIZE: '1mb',
      RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000,
      RATE_LIMIT_MAX_REQUESTS: 200,
    });
  });

  it('keeps the fallback FX rate finite and positive', () => {
    expect(Number.isFinite(USD_SGD_FALLBACK_RATE)).toBe(true);
    expect(USD_SGD_FALLBACK_RATE).toBeGreaterThan(0);
  });

  it('keeps domain enum arrays unique and non-empty for Zod validation', () => {
    for (const values of [ASSET_CATEGORIES, STORAGE_TYPES, TRADE_DIRECTIONS, TRADE_STATUSES]) {
      expect(values.length).toBeGreaterThan(0);
      expect(new Set(values).size).toBe(values.length);
      expect(values.every((value) => typeof value === 'string' && value.length > 0)).toBe(true);
    }
  });
});

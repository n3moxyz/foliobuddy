import { describe, it, expect } from 'vitest';
import {
  USD_SGD_FALLBACK_RATE,
  MAX_POSITIONS_PER_CATEGORY,
  DEFAULT_SNAPSHOT_LIMIT,
  MAX_HISTORICAL_DAYS,
  MAX_PAYLOAD_SIZE,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
} from '../lib/constants.js';

describe('constants', () => {
  describe('USD_SGD_FALLBACK_RATE', () => {
    it('is a positive number', () => {
      expect(USD_SGD_FALLBACK_RATE).toBeGreaterThan(0);
      expect(typeof USD_SGD_FALLBACK_RATE).toBe('number');
    });

    it('is within reasonable FX rate range', () => {
      expect(USD_SGD_FALLBACK_RATE).toBeGreaterThan(1);
      expect(USD_SGD_FALLBACK_RATE).toBeLessThan(2);
    });
  });

  describe('MAX_POSITIONS_PER_CATEGORY', () => {
    it('is a positive number', () => {
      expect(MAX_POSITIONS_PER_CATEGORY).toBeGreaterThan(0);
      expect(typeof MAX_POSITIONS_PER_CATEGORY).toBe('number');
    });

    it('is a reasonable limit', () => {
      expect(MAX_POSITIONS_PER_CATEGORY).toBeGreaterThanOrEqual(10);
      expect(MAX_POSITIONS_PER_CATEGORY).toBeLessThanOrEqual(100);
    });
  });

  describe('DEFAULT_SNAPSHOT_LIMIT', () => {
    it('is a positive number', () => {
      expect(DEFAULT_SNAPSHOT_LIMIT).toBeGreaterThan(0);
      expect(typeof DEFAULT_SNAPSHOT_LIMIT).toBe('number');
    });

    it('is a reasonable default', () => {
      expect(DEFAULT_SNAPSHOT_LIMIT).toBeGreaterThanOrEqual(50);
      expect(DEFAULT_SNAPSHOT_LIMIT).toBeLessThanOrEqual(500);
    });
  });

  describe('MAX_HISTORICAL_DAYS', () => {
    it('is a positive number', () => {
      expect(MAX_HISTORICAL_DAYS).toBeGreaterThan(0);
      expect(typeof MAX_HISTORICAL_DAYS).toBe('number');
    });

    it('is within a reasonable range', () => {
      expect(MAX_HISTORICAL_DAYS).toBeGreaterThanOrEqual(30);
      expect(MAX_HISTORICAL_DAYS).toBeLessThanOrEqual(730);
    });
  });

  describe('MAX_PAYLOAD_SIZE', () => {
    it('is a string', () => {
      expect(typeof MAX_PAYLOAD_SIZE).toBe('string');
    });

    it('is in valid Express format', () => {
      expect(MAX_PAYLOAD_SIZE).toMatch(/^\d+(kb|mb|gb)$/i);
    });
  });

  describe('RATE_LIMIT_WINDOW_MS', () => {
    it('is a positive number', () => {
      expect(RATE_LIMIT_WINDOW_MS).toBeGreaterThan(0);
      expect(typeof RATE_LIMIT_WINDOW_MS).toBe('number');
    });

    it('is in milliseconds', () => {
      // Should be at least 1 minute (60000ms) and less than 1 hour (3600000ms)
      expect(RATE_LIMIT_WINDOW_MS).toBeGreaterThanOrEqual(60000);
      expect(RATE_LIMIT_WINDOW_MS).toBeLessThanOrEqual(3600000);
    });
  });

  describe('RATE_LIMIT_MAX_REQUESTS', () => {
    it('is a positive number', () => {
      expect(RATE_LIMIT_MAX_REQUESTS).toBeGreaterThan(0);
      expect(typeof RATE_LIMIT_MAX_REQUESTS).toBe('number');
    });

    it('is a reasonable limit', () => {
      expect(RATE_LIMIT_MAX_REQUESTS).toBeGreaterThanOrEqual(10);
      expect(RATE_LIMIT_MAX_REQUESTS).toBeLessThanOrEqual(1000);
    });
  });
});

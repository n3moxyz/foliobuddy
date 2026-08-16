import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../lib/logger.js', () => ({ logger: mocks.logger }));

const { warnOnMissingProductionConfig } = await import('../lib/startupChecks.js');

const originalNodeEnv = process.env.NODE_ENV;
const originalAdminUserIds = process.env.ADMIN_USER_IDS;

describe('startup checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'production';
    delete process.env.ADMIN_USER_IDS;
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalAdminUserIds === undefined) {
      delete process.env.ADMIN_USER_IDS;
    } else {
      process.env.ADMIN_USER_IDS = originalAdminUserIds;
    }
  });

  it('warns in production when admin users are not configured', () => {
    warnOnMissingProductionConfig();

    expect(mocks.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('ADMIN_USER_IDS is not configured')
    );
  });

  it('stays quiet outside production or when admin users are configured', () => {
    process.env.NODE_ENV = 'development';
    warnOnMissingProductionConfig();

    process.env.NODE_ENV = 'production';
    process.env.ADMIN_USER_IDS = 'user_123';
    warnOnMissingProductionConfig();

    expect(mocks.logger.warn).not.toHaveBeenCalled();
  });

  it('always states in production that access gating depends on the Clerk access mode', () => {
    process.env.ADMIN_USER_IDS = 'user_123';
    warnOnMissingProductionConfig();

    expect(mocks.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Clerk instance Access mode')
    );
  });

  it('does not log the Clerk reminder outside production', () => {
    process.env.NODE_ENV = 'development';
    warnOnMissingProductionConfig();

    expect(mocks.logger.info).not.toHaveBeenCalled();
  });
});

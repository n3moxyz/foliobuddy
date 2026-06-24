import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(),
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@clerk/express', () => ({
  clerkMiddleware: vi.fn(),
  getAuth: mocks.getAuth,
  requireAuth: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('../lib/logger.js', () => ({ logger: mocks.logger }));

const { ensureUser } = await import('../middleware/auth.js');

const originalNodeEnv = process.env.NODE_ENV;
const originalBypass = process.env.ALLOW_LOCAL_AUTH_BYPASS;
const originalLocalUser = process.env.LOCAL_AUTH_USER_ID;

function restoreEnv() {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalBypass === undefined) delete process.env.ALLOW_LOCAL_AUTH_BYPASS;
  else process.env.ALLOW_LOCAL_AUTH_BYPASS = originalBypass;

  if (originalLocalUser === undefined) delete process.env.LOCAL_AUTH_USER_ID;
  else process.env.LOCAL_AUTH_USER_ID = originalLocalUser;
}

function mockResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

describe('ensureUser local auth bypass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuth.mockReturnValue({ userId: null });
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.user.create.mockImplementation(async ({ data }) => data);
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_LOCAL_AUTH_BYPASS;
    delete process.env.LOCAL_AUTH_USER_ID;
  });

  afterEach(() => {
    restoreEnv();
  });

  it('returns 401 when Clerk has no user and local bypass is disabled', async () => {
    const req = {} as Request;
    const res = mockResponse();
    const next = vi.fn() as NextFunction;

    await ensureUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches the configured local user outside production when bypass is enabled', async () => {
    process.env.ALLOW_LOCAL_AUTH_BYPASS = 'true';
    process.env.LOCAL_AUTH_USER_ID = 'local-scale-user';
    const req = {} as Request;
    const res = mockResponse();
    const next = vi.fn() as NextFunction;

    await ensureUser(req, res, next);

    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'local-scale-user' },
    });
    expect(mocks.prisma.user.create).toHaveBeenCalledWith({
      data: {
        id: 'local-scale-user',
        email: 'local-scale-user@clerk.user',
        name: null,
      },
    });
    expect(req.userId).toBe('local-scale-user');
    expect(next).toHaveBeenCalledOnce();
  });

  it('ignores local bypass in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_LOCAL_AUTH_BYPASS = 'true';
    process.env.LOCAL_AUTH_USER_ID = 'local-scale-user';
    const req = {} as Request;
    const res = mockResponse();
    const next = vi.fn() as NextFunction;

    await ensureUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

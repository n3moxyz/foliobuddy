import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../middleware/errorHandler.js';
import { createTestApp } from '../helpers/createTestApp.js';

const mocks = vi.hoisted(() => ({
  issue: vi.fn(),
  consume: vi.fn(),
  getAuth: vi.fn(),
  user: vi.fn(),
  error: vi.fn(),
}));
vi.mock('../../services/ibkrHelperPermitService.js', () => ({
  issueIbkrHelperPermit: mocks.issue,
  consumeIbkrHelperPermit: mocks.consume,
}));
vi.mock('@clerk/express', () => ({
  getAuth: mocks.getAuth,
  clerkMiddleware: vi.fn(),
  requireAuth: vi.fn(),
}));
vi.mock('../../lib/prisma.js', () => ({
  prisma: { user: { findUnique: mocks.user } },
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { error: mocks.error, warn: vi.fn(), info: vi.fn() },
}));
vi.mock('../../lib/sentry.js', () => ({ Sentry: { captureException: vi.fn() } }));
const { ensureUser } = await import('../../middleware/auth.js');
const {
  default: helperRouter,
  ibkrHelperOwnerRouter,
  ibkrHelperErrorHandler,
} = await import('../../routes/ibkrHelper.js');
const owner = createTestApp(ibkrHelperOwnerRouter, '/api/v1/ibkr/helper-permits');
const authenticatedOwner = express();
authenticatedOwner.use(express.json());
authenticatedOwner.use('/api/v1/ibkr/helper-permits', ensureUser, ibkrHelperOwnerRouter);
authenticatedOwner.use(ibkrHelperErrorHandler);
const helper = express();
helper.use(express.json());
helper.use('/api/v1/ibkr-helper', helperRouter);
helper.use(ibkrHelperErrorHandler);
helper.use(errorHandler);
const scope = {
  cashPositionId: 'owned-cash',
  challenge: 'c'.repeat(43),
  connectorFingerprint: 'a'.repeat(64),
  operation: 'pair',
  jobId: null,
};
const permit = 'p'.repeat(43);
const unavailable = { error: 'IBKR helper authorization is unavailable' };

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe('owner helper permits', () => {
  it('issues from the Clerk session without accepting a client owner', async () => {
    mocks.getAuth.mockReturnValue({ userId: 'clerk-owner' });
    mocks.user.mockResolvedValue({ id: 'clerk-owner' });
    mocks.issue.mockResolvedValue({ permit, expiresAt: '2026-10-02T00:01:00Z' });
    const response = await request(authenticatedOwner)
      .post('/api/v1/ibkr/helper-permits')
      .send(scope);
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ permit, expiresAt: '2026-10-02T00:01:00Z' });
    expect(mocks.issue).toHaveBeenCalledWith('clerk-owner', scope);
  });

  it('rejects an agent API key when no Clerk session is present', async () => {
    vi.stubEnv('ALLOW_LOCAL_AUTH_BYPASS', 'false');
    vi.stubEnv('AGENT_API_KEY', 'fictional-agent-key');
    vi.stubEnv('AGENT_USER_ID', 'agent-owner');
    mocks.getAuth.mockReturnValue({ userId: null });
    const response = await request(authenticatedOwner)
      .post('/api/v1/ibkr/helper-permits')
      .set('x-api-key', 'fictional-agent-key')
      .send(scope);
    expect(response.status).toBe(401);
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it('rejects injected owners, malformed scope and invalid operation/job combinations', async () => {
    for (const input of [
      { ...scope, userId: 'another-owner' },
      { ...scope, challenge: 'short' },
      { ...scope, connectorFingerprint: 'not-a-fingerprint' },
      { ...scope, jobId: 'j'.repeat(43) },
      { ...scope, operation: 'capture', jobId: 'j'.repeat(43) },
      ...['checkpoint', 'verify', 'finish'].map((operation) => ({ ...scope, operation })),
    ]) {
      const response = await request(owner).post('/api/v1/ibkr/helper-permits').send(input);
      expect(response.status).toBe(400);
      expect(response.body).toEqual(unavailable);
    }
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });
});

describe('purpose-limited helper permit consumption', () => {
  it('returns only the trusted identity envelope without financial data or the permit', async () => {
    const trusted = { userId: 'clerk-owner', ...scope };
    mocks.consume.mockResolvedValue(trusted);
    const response = await request(helper)
      .post('/api/v1/ibkr-helper/consume')
      .send({ ...scope, permit });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: trusted });
    expect(mocks.consume).toHaveBeenCalledWith({ ...scope, permit });
    expect(JSON.stringify(response.body)).not.toContain(permit);
  });

  it('rejects injected fields before consumption without echoing request values', async () => {
    const response = await request(helper)
      .post('/api/v1/ibkr-helper/consume')
      .send({ ...scope, permit, userId: 'another-owner' });
    expect(response.status).toBe(400);
    expect(response.body).toEqual(unavailable);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('does not send or log raw service errors that could contain permits', async () => {
    mocks.consume.mockRejectedValue(new Error(`Fictional failure containing ${permit}`));
    const response = await request(helper)
      .post('/api/v1/ibkr-helper/consume')
      .send({ ...scope, permit });
    expect(response.status).toBe(503);
    expect(response.body).toEqual(unavailable);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('sanitizes malformed JSON errors before the normal request logger', async () => {
    const response = await request(helper)
      .post('/api/v1/ibkr-helper/consume')
      .set('Content-Type', 'application/json')
      .send(`{"permit":"${permit}",`);
    expect(response.status).toBe(400);
    expect(response.body).toEqual(unavailable);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });
});

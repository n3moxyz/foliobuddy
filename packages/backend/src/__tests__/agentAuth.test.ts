import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const logger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock('../lib/logger.js', () => ({ logger }));

const { agentAuth } = await import('../middleware/agentAuth.js');
const originalKey = process.env.AGENT_API_KEY;
const originalUser = process.env.AGENT_USER_ID;

function response() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

describe('agentAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AGENT_API_KEY = 'constant-time-secret';
    process.env.AGENT_USER_ID = 'agent-user';
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.AGENT_API_KEY;
    else process.env.AGENT_API_KEY = originalKey;
    if (originalUser === undefined) delete process.env.AGENT_USER_ID;
    else process.env.AGENT_USER_ID = originalUser;
  });

  it.each([
    [undefined, 'missing'],
    ['wrong', 'different length'],
    ['constant-time-secreu', 'same length'],
  ])('rejects a %s key (%s)', (apiKey, _description) => {
    const req = {
      headers: { ...(apiKey === undefined ? {} : { 'x-api-key': apiKey }) },
    } as unknown as Request;
    const res = response();
    const next = vi.fn() as NextFunction;

    agentAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts the first Node header value and attaches the configured user', () => {
    const req = {
      headers: { 'x-api-key': ['constant-time-secret', 'ignored'] },
    } as unknown as Request;
    const res = response();
    const next = vi.fn() as NextFunction;

    agentAuth(req, res, next);

    expect(req.userId).toBe('agent-user');
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('reports server misconfiguration only after a valid key', () => {
    delete process.env.AGENT_USER_ID;
    const req = {
      headers: { 'x-api-key': 'constant-time-secret' },
    } as unknown as Request;
    const res = response();

    agentAuth(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Server misconfigured' });
    expect(logger.error).toHaveBeenCalledWith('AGENT_USER_ID not configured');
  });
});

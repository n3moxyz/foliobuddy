import express from 'express';
import rateLimit from 'express-rate-limit';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { configureProxyTrust } from '../lib/proxyTrust.js';

const trusted = 'loopback, 10.0.1.0/24, 10.0.2.0/24';
function appWithProxyTrust() {
  const app = express();
  configureProxyTrust(app, trusted);
  app.get('/', (req, res) => res.json({ ip: req.ip, secure: req.secure }));
  return app;
}

describe('explicit proxy trust', () => {
  it('preserves the default when no proxy networks are configured', () => {
    const app = express();
    configureProxyTrust(app);
    expect(app.get('trust proxy')).toBe(false);
  });

  it('rejects malformed networks at startup', () => {
    expect(() => configureProxyTrust(express(), 'not-a-network')).toThrow();
  });

  it('uses the visitor address through the tunnel and local proxy', async () => {
    const response = await request(appWithProxyTrust())
      .get('/')
      .set('X-Forwarded-For', '198.51.100.10, 10.0.1.1')
      .set('X-Forwarded-Proto', 'https');
    expect(response.body).toEqual({ ip: '198.51.100.10', secure: true });
  });

  it('ignores a forged prefix on the shorter direct proxy route', async () => {
    const response = await request(appWithProxyTrust())
      .get('/')
      .set('X-Forwarded-For', '203.0.113.99, 198.51.100.10');
    expect(response.body.ip).toBe('198.51.100.10');
  });

  it('stops at an untrusted proxy instead of trusting a fixed hop count', async () => {
    const response = await request(appWithProxyTrust())
      .get('/')
      .set('X-Forwarded-For', '203.0.113.99, 192.0.2.10, 10.0.1.1');
    expect(response.body.ip).toBe('192.0.2.10');
  });

  it('preserves IPv6 visitors through the IPv4 tunnel connection', async () => {
    const response = await request(appWithProxyTrust())
      .get('/')
      .set('X-Forwarded-For', '2001:db8::42, 10.0.1.1');
    expect(response.body.ip).toBe('2001:db8::42');
  });

  it('keeps visitor rate limits separate and rejects forged-prefix resets', async () => {
    const app = express();
    configureProxyTrust(app, trusted);
    app.use(
      rateLimit({ windowMs: 60_000, limit: 1, standardHeaders: false, legacyHeaders: false })
    );
    app.get('/', (_req, res) => res.sendStatus(200));
    await request(app).get('/').set('X-Forwarded-For', '198.51.100.10, 10.0.1.1').expect(200);
    await request(app).get('/').set('X-Forwarded-For', '198.51.100.11, 10.0.1.1').expect(200);
    await request(app)
      .get('/')
      .set('X-Forwarded-For', '203.0.113.99, 198.51.100.10, 10.0.1.1')
      .expect(429);
  });
});

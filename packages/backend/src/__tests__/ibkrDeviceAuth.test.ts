import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalIbkrDevice,
  hashIbkrDevice,
  ibkrDeviceAudience,
  verifyIbkrEnrollment,
  verifyIbkrDeviceSignature,
} from '../services/ibkrDeviceAuth.js';

const audience = 'https://api.foliobuddy.xyz';
const now = Date.parse('2026-10-02T00:00:00.000Z');
const key = generateKeyPairSync('ed25519');
const deviceId = randomUUID();
const publicKey = key.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const enrollmentBody = {
  version: 1,
  deviceId,
  cashPositionId: 'owned-ibkr-cash',
  name: 'Fictional Merlin',
  publicKey,
  connectorFingerprint: 'a'.repeat(64),
  audience,
  createdAt: new Date(now).toISOString(),
};
const signedEnrollment = (body: Record<string, unknown> = enrollmentBody) => ({
  ...body,
  signature: sign(
    null,
    Buffer.from(JSON.stringify(canonicalIbkrDevice(body))),
    key.privateKey
  ).toString('base64'),
});
const body = { capture: { version: 1, test: true } };
const path = '/api/v1/ibkr-device/preview';
function headers(timestamp = new Date(now).toISOString(), requestBody: unknown = body) {
  const nonce = randomUUID();
  const message = {
    version: 1,
    audience,
    deviceId,
    method: 'POST',
    path,
    timestamp,
    nonce,
    bodyHash: hashIbkrDevice(requestBody),
  };
  return {
    'x-ibkr-device-id': deviceId,
    'x-ibkr-timestamp': timestamp,
    'x-ibkr-nonce': nonce,
    'x-ibkr-signature': sign(
      null,
      Buffer.from(JSON.stringify(canonicalIbkrDevice(message))),
      key.privateKey
    ).toString('base64'),
  };
}
const grant = { id: deviceId, publicKey, audience };

afterEach(() => vi.unstubAllEnvs());

describe('IBKR device enrollment', () => {
  it('accepts public Ed25519 proof of possession and derives a stable fingerprint', () => {
    const result = verifyIbkrEnrollment(signedEnrollment(), now);
    expect(result.deviceId).toBe(deviceId);
    expect(result.cashPositionId).toBe(enrollmentBody.cashPositionId);
    expect(result.keyFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result).not.toHaveProperty('privateKey');
  });

  it('rejects changed enrollment scope and unknown fields', () => {
    expect(() => verifyIbkrEnrollment({ ...signedEnrollment(), name: 'Changed' }, now)).toThrow(
      /enrollment/i
    );
    expect(() => verifyIbkrEnrollment({ ...signedEnrollment(), userId: 'other' }, now)).toThrow();
    expect(() =>
      verifyIbkrEnrollment({ ...signedEnrollment(), cashPositionId: 'different-cash' }, now)
    ).toThrow(/enrollment/i);
  });

  it('requires a bounded cash anchor in the signed enrollment', () => {
    const withoutAnchor: Record<string, unknown> = { ...enrollmentBody };
    delete withoutAnchor.cashPositionId;
    expect(() => verifyIbkrEnrollment(signedEnrollment(withoutAnchor), now)).toThrow();
    for (const cashPositionId of ['', 'a'.repeat(101)]) {
      expect(() =>
        verifyIbkrEnrollment(signedEnrollment({ ...enrollmentBody, cashPositionId }), now)
      ).toThrow();
    }
  });

  it('rejects expired or future enrollment', () => {
    expect(() => verifyIbkrEnrollment(signedEnrollment(), now + 86_400_001)).toThrow(/expired/i);
    expect(() => verifyIbkrEnrollment(signedEnrollment(), now - 30_001)).toThrow(/expired/i);
  });

  it('refuses a different audience and non-Ed25519 keys', () => {
    expect(() =>
      verifyIbkrEnrollment(
        signedEnrollment({
          ...enrollmentBody,
          audience: 'https://unrelated.example',
        }),
        now
      )
    ).toThrow(/audience/i);
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
    expect(() =>
      verifyIbkrEnrollment(
        signedEnrollment({
          ...enrollmentBody,
          publicKey: rsa.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
        }),
        now
      )
    ).toThrow(/Ed25519/i);
  });

  it('allows an explicitly configured loopback audience only outside production', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('IBKR_DEVICE_AUDIENCE', 'http://localhost:4101');
    expect(ibkrDeviceAudience()).toBe('http://localhost:4101');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => ibkrDeviceAudience()).toThrow(/audience/i);
  });
});

describe('IBKR signed requests', () => {
  it('accepts a signed operation bound to the request body and device', () => {
    const result = verifyIbkrDeviceSignature(headers(), 'POST', path, body, grant, now);
    expect(result.deviceId).toBe(deviceId);
    expect(result.nonce).toMatch(/^[a-f0-9-]{36}$/);
  });

  it.each([
    ['body', 'POST', path, { capture: { version: 2 } }],
    ['path', 'POST', '/api/v1/ibkr-device/apply', body],
    ['method', 'GET', path, body],
    ['query', 'POST', `${path}?other=true`, body],
  ])('rejects altered %s', (_name, method, requestPath, requestBody) => {
    expect(() =>
      verifyIbkrDeviceSignature(
        headers(),
        method as string,
        requestPath as string,
        requestBody,
        grant,
        now
      )
    ).toThrow(/signature|request/i);
  });

  it('rejects stale signatures, excessive future skew and malformed signature bytes', () => {
    for (const delta of [-180_001, 180_001]) {
      expect(() =>
        verifyIbkrDeviceSignature(
          headers(new Date(now + delta).toISOString()),
          'POST',
          path,
          body,
          grant,
          now
        )
      ).toThrow(/expired/i);
    }
    expect(() =>
      verifyIbkrDeviceSignature(
        { ...headers(), 'x-ibkr-signature': '!!!!' },
        'POST',
        path,
        body,
        grant,
        now
      )
    ).toThrow(/signature/i);
  });

  it('rejects a different device key and duplicate header values', () => {
    const different = generateKeyPairSync('ed25519');
    expect(() =>
      verifyIbkrDeviceSignature(
        headers(),
        'POST',
        path,
        body,
        {
          ...grant,
          publicKey: different.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
        },
        now
      )
    ).toThrow(/signature/i);
    expect(() =>
      verifyIbkrDeviceSignature(
        { ...headers(), 'x-ibkr-nonce': [randomUUID(), randomUUID()] },
        'POST',
        path,
        body,
        grant,
        now
      )
    ).toThrow();
  });
});

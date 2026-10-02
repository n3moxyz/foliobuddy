import { createHash, createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';

const productionAudience = 'https://api.foliobuddy.xyz';
const requestWindowMs = 180_000;
const operations = new Set(['status', 'preview', 'apply', 'readback', 'complete', 'failure']);
const enrollmentSchema = z
  .object({
    version: z.literal(1),
    deviceId: z.string().uuid(),
    cashPositionId: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(80),
    publicKey: z.string().min(1).max(1024),
    connectorFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    audience: z.string().max(200),
    createdAt: z.string().datetime(),
    signature: z.string().max(128),
  })
  .strict();
const requestHeaders = z.object({
  deviceId: z.string().uuid(),
  timestamp: z.string().datetime(),
  nonce: z.string().uuid(),
  signature: z.string().max(128),
});

/** Matches the existing helper's audit canonicalization; no secrets enter this value. */
export function canonicalIbkrDevice(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalIbkrDevice);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalIbkrDevice(entry)])
    );
  return value;
}
export function hashIbkrDevice(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalIbkrDevice(value)))
    .digest('hex');
}
function messageBytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(canonicalIbkrDevice(value)));
}
function fail(message: string): never {
  throw new AppError(message, 401);
}
function base64(value: string, length: number, message: string): Buffer {
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== length || bytes.toString('base64') !== value) fail(message);
  return bytes;
}
function publicKeyFrom(value: string) {
  try {
    const bytes = base64(value, 44, 'An Ed25519 public key is required');
    const key = createPublicKey({ key: bytes, format: 'der', type: 'spki' });
    if (
      key.asymmetricKeyType !== 'ed25519' ||
      key.export({ format: 'der', type: 'spki' }).toString('base64') !== value
    )
      fail('An Ed25519 public key is required');
    return key;
  } catch {
    return fail('An Ed25519 public key is required');
  }
}
export function ibkrDeviceAudience(): string {
  const value = process.env.IBKR_DEVICE_AUDIENCE ?? productionAudience;
  if (value === productionAudience) return value;
  try {
    const url = new URL(value);
    if (
      process.env.NODE_ENV !== 'production' &&
      ['http:', 'https:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      url.origin === value &&
      !url.username &&
      !url.password
    )
      return value;
  } catch {
    /* Invalid configuration always fails closed. */
  }
  throw new AppError('IBKR device audience is not configured safely', 503);
}
export function verifyIbkrEnrollment(raw: unknown, now = Date.now()) {
  const enrollment = enrollmentSchema.parse(raw);
  if (enrollment.audience !== ibkrDeviceAudience()) fail('IBKR enrollment audience differs');
  const age = now - Date.parse(enrollment.createdAt);
  if (!Number.isFinite(age) || age < -30_000 || age > 86_400_000)
    fail('IBKR device enrollment expired; create a fresh public enrollment');
  const key = publicKeyFrom(enrollment.publicKey);
  const { signature, ...body } = enrollment;
  if (!verify(null, messageBytes(body), key, base64(signature, 64, 'Invalid enrollment signature')))
    fail('Invalid IBKR enrollment signature');
  return {
    ...body,
    keyFingerprint: createHash('sha256')
      .update(Buffer.from(enrollment.publicKey, 'base64'))
      .digest('hex'),
  };
}

export type IbkrDeviceHeaders = Record<string, string | string[] | undefined>;
export type IbkrDeviceSignature = {
  deviceId: string;
  timestamp: string;
  nonce: string;
};
export function parseIbkrDeviceHeaders(headers: IbkrDeviceHeaders) {
  const result = requestHeaders.safeParse({
    deviceId: headers['x-ibkr-device-id'],
    timestamp: headers['x-ibkr-timestamp'],
    nonce: headers['x-ibkr-nonce'],
    signature: headers['x-ibkr-signature'],
  });
  if (!result.success) return fail('Invalid IBKR device request signature');
  return result.data;
}
export function requireFreshIbkrSignature(timestamp: string, now = Date.now()) {
  if (
    !Number.isFinite(Date.parse(timestamp)) ||
    Math.abs(now - Date.parse(timestamp)) > requestWindowMs
  )
    fail('IBKR device request expired');
}
export function verifyIbkrDeviceSignature(
  headers: IbkrDeviceHeaders,
  method: string,
  path: string,
  body: unknown,
  grant: { id: string; publicKey: string; audience: string },
  now = Date.now()
): IbkrDeviceSignature {
  const parsed = parseIbkrDeviceHeaders(headers);
  const operation = path.replace('/api/v1/ibkr-device/', '');
  if (
    method !== 'POST' ||
    !operations.has(operation) ||
    path !== `/api/v1/ibkr-device/${operation}` ||
    parsed.deviceId !== grant.id ||
    grant.audience !== ibkrDeviceAudience()
  )
    fail('Invalid IBKR device request signature');
  requireFreshIbkrSignature(parsed.timestamp, now);
  const { signature, ...identity } = parsed;
  const signed = {
    version: 1,
    audience: grant.audience,
    ...identity,
    method,
    path,
    bodyHash: hashIbkrDevice(body),
  };
  if (
    !verify(
      null,
      messageBytes(signed),
      publicKeyFrom(grant.publicKey),
      base64(signature, 64, 'Invalid IBKR device signature')
    )
  )
    fail('Invalid IBKR device signature');
  return identity;
}

import { createPrivateKey, randomUUID, sign } from 'node:crypto';
import { canonical, hash } from '../ibkr-sync-helper/audit.mjs';

export const DEFAULT_AUDIENCE = 'https://api.foliobuddy.xyz';
const operations = new Set(['status', 'preview', 'apply', 'readback', 'complete', 'failure']);
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const canonicalBytes = (value) => Buffer.from(JSON.stringify(canonical(value)));

export function validateAudience(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('The worker audience is invalid.');
  }
  if (
    url.origin !== value ||
    url.username ||
    url.password ||
    (value !== DEFAULT_AUDIENCE &&
      !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))
  )
    throw new Error(
      'The worker audience must be FolioBuddy production or an explicit loopback sandbox.'
    );
  return value;
}

export function ed25519PrivateKey(value) {
  const key = value?.type === 'private' ? value : createPrivateKey(value);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('The worker requires an Ed25519 key.');
  return key;
}

async function responseJson(response, limit) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit)
    throw new Error('The FolioBuddy response exceeds the worker limit.');
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    throw new Error('FolioBuddy did not return a JSON response.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('FolioBuddy returned an empty response.');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) throw new Error('The FolioBuddy response exceeds the worker limit.');
      chunks.push(Buffer.from(part.value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('FolioBuddy returned an invalid response.');
  return value;
}

/** No cookies, bearer credentials, redirects, generic paths or automatic retries. */
export function createSignedClient({
  audience,
  deviceId,
  privateKey,
  fetchImpl = fetch,
  now = () => new Date(),
  maxResponseBytes = 2 * 1024 * 1024,
  timeoutMs = 45000,
}) {
  validateAudience(audience);
  if (!UUID.test(deviceId)) throw new Error('The worker device identity is invalid.');
  const key = ed25519PrivateKey(privateKey);
  return {
    async request(operation, body) {
      if (!operations.has(operation)) throw new Error('Unsupported worker operation.');
      const path = `/api/v1/ibkr-device/${operation}`;
      const timestamp = now().toISOString();
      const nonce = randomUUID();
      const message = {
        version: 1,
        audience,
        deviceId,
        method: 'POST',
        path,
        timestamp,
        nonce,
        bodyHash: hash(body),
      };
      const payload = JSON.stringify(body);
      if (Buffer.byteLength(payload) > 1024 * 1024)
        throw new Error('The worker request is too large.');
      const response = await fetchImpl(`${audience}${path}`, {
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/json',
          'x-ibkr-device-id': deviceId,
          'x-ibkr-timestamp': timestamp,
          'x-ibkr-nonce': nonce,
          'x-ibkr-signature': sign(null, canonicalBytes(message), key).toString('base64'),
        },
        body: payload,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.redirected || (response.status >= 300 && response.status < 400))
        throw new Error('The worker refuses FolioBuddy redirects.');
      const data = await responseJson(response, maxResponseBytes);
      if (!response.ok) {
        const error = new Error(
          typeof data.error === 'string'
            ? data.error.slice(0, 2000)
            : 'FolioBuddy refused the worker operation.'
        );
        error.status = response.status;
        throw error;
      }
      return data;
    },
  };
}

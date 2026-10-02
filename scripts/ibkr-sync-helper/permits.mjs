const API_BY_ORIGIN = {
  'https://foliobuddy.xyz': 'https://api.foliobuddy.xyz',
  'http://localhost:4100': 'http://127.0.0.1:4101',
  'http://127.0.0.1:4100': 'http://127.0.0.1:4101',
  'http://localhost:4000': 'http://127.0.0.1:4001',
};
export const opaque = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export const validAnchor = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
export const validFingerprint = (value) =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const OPERATIONS = ['pair', 'capture', 'checkpoint', 'verify', 'finish'];
export const scopeFields = [
  'cashPositionId',
  'connectorFingerprint',
  'operation',
  'challenge',
  'jobId',
];
export const sameScope = (left, right) => scopeFields.every((key) => left[key] === right[key]);
export const validScope = (value) =>
  value &&
  validAnchor(value.cashPositionId) &&
  validFingerprint(value.connectorFingerprint) &&
  opaque(value.challenge) &&
  OPERATIONS.includes(value.operation) &&
  (['pair', 'capture'].includes(value.operation) ? value.jobId === null : opaque(value.jobId));

/** Fixed destination, bounded transport, no Clerk or broker credentials. */
export function createPermitConsumer(origin, fetcher = fetch) {
  const api = API_BY_ORIGIN[origin];
  if (!api) throw new Error('Unsupported helper app.');
  return async (request) => {
    if (!opaque(request.permit) || !validScope(request))
      throw new Error('Fresh signed-in authorization is required.');
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 10000);
    try {
      const response = await fetcher(`${api}/api/v1/ibkr-helper/consume`, {
        method: 'POST',
        redirect: 'error',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: abort.signal,
      });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
        throw new Error('Authorization failed.');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Authorization is incomplete.');
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 8192) throw new Error('Authorization is too large.');
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8')).data;
      if (
        !validScope(result) ||
        !sameScope(result, request) ||
        typeof result.userId !== 'string' ||
        !result.userId ||
        result.userId.length > 200 ||
        Object.keys(result).some((key) => ![...scopeFields, 'userId'].includes(key))
      )
        throw new Error('Authorization does not match.');
      return result;
    } catch {
      throw new Error(
        'The signed-in IBKR authorization expired or could not be verified. Sign in and try again.'
      );
    } finally {
      clearTimeout(timer);
      abort.abort();
    }
  };
}

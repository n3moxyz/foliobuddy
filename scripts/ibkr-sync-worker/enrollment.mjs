import { createPublicKey, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { access, rename } from 'node:fs/promises';
import path from 'node:path';
import { privateDirectory } from '../ibkr-sync-helper/audit.mjs';
import {
  DEFAULT_AUDIENCE,
  UUID,
  canonicalBytes,
  ed25519PrivateKey,
  validateAudience,
} from './signed-client.mjs';
import {
  privateRead,
  privateWrite,
  readJson,
  syncDirectory,
  writeJson,
  withWorkerLock,
} from './files.mjs';

export const workerDirectory = (root) => path.join(root, '.local', 'ibkr-worker');
export const validCashPositionId = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);

export function validateConfig(config, root) {
  if (
    config?.version !== 1 ||
    !UUID.test(config.deviceId) ||
    config.root !== root ||
    typeof config.name !== 'string' ||
    !config.name.trim() ||
    config.name.length > 80 ||
    !/^[a-f0-9]{64}$/.test(config.connectorFingerprint ?? '') ||
    !validCashPositionId(config.cashPositionId) ||
    typeof config.publicKey !== 'string' ||
    !path.isAbsolute(config.binary ?? '')
  )
    throw new Error('The private worker configuration is incomplete.');
  validateAudience(config.audience);
  const key = createPublicKey({
    key: Buffer.from(config.publicKey, 'base64'),
    format: 'der',
    type: 'spki',
  });
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('The worker public key is not Ed25519.');
  return config;
}

export async function loadWorkerIdentity(root) {
  const directory = workerDirectory(root);
  const config = validateConfig(await readJson(path.join(directory, 'config.json')), root);
  const privateKey = ed25519PrivateKey(await privateRead(path.join(directory, 'device-key.pem')));
  const publicKey = createPublicKey(privateKey)
    .export({ type: 'spki', format: 'der' })
    .toString('base64');
  if (publicKey !== config.publicKey)
    throw new Error('The worker key no longer matches its enrolled identity.');
  return { config, privateKey };
}

/** Generate and use the secret locally. Returned enrollment contains only public material. */
async function prepareIdentity({
  root,
  audience = DEFAULT_AUDIENCE,
  name = 'My Mac',
  connectorFingerprint,
  cashPositionId,
  binary,
  now = new Date(),
  rotate = false,
}) {
  if (!path.isAbsolute(root) || !path.isAbsolute(binary ?? ''))
    throw new Error('Absolute workspace and Codex paths are required.');
  validateAudience(audience);
  if (!/^[a-f0-9]{64}$/.test(connectorFingerprint ?? ''))
    throw new Error('The connector fingerprint is invalid.');
  if (!validCashPositionId(cashPositionId))
    throw new Error(
      'The existing owned IBKR cash anchor is required. Pass --cash-position-id with its public position reference.'
    );
  if (typeof name !== 'string' || !name.trim() || name.length > 80)
    throw new Error('The device name is invalid.');
  const directory = workerDirectory(root);
  await privateDirectory(path.join(root, '.local'));
  await privateDirectory(directory);
  let existing = await readJson(path.join(directory, 'config.json'), null);
  let privateKey;
  if (existing) {
    const identity = await loadWorkerIdentity(root);
    existing = identity.config;
    privateKey = identity.privateKey;
    if (
      !rotate &&
      (existing.audience !== audience ||
        existing.connectorFingerprint !== connectorFingerprint ||
        existing.cashPositionId !== cashPositionId)
    )
      throw new Error(
        'The worker audience, broker connection or cash anchor changed. Revoke the old device before explicitly rotating its key.'
      );
    if (rotate) {
      const retired = path.join(directory, 'retired', existing.deviceId);
      await privateDirectory(path.dirname(retired));
      await privateDirectory(retired);
      // Retain the old identity; never clear a crash guard when rotating a key.
      await writeJson(path.join(retired, 'config.json'), existing, { exclusive: true });
      await rename(path.join(directory, 'device-key.pem'), path.join(retired, 'device-key.pem'));
      await syncDirectory(retired);
      await syncDirectory(directory);
      existing = null;
      privateKey = null;
    }
  } else {
    try {
      await access(path.join(directory, 'device-key.pem'));
      throw new Error(
        'A key without configuration exists. Inspect the interrupted setup before continuing.'
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (!privateKey) {
    const pair = generateKeyPairSync('ed25519');
    privateKey = pair.privateKey;
    await privateWrite(
      path.join(directory, 'device-key.pem'),
      privateKey.export({ type: 'pkcs8', format: 'pem' }),
      { exclusive: true }
    );
  }
  const config = {
    version: 1,
    deviceId: existing?.deviceId ?? randomUUID(),
    name: name.trim(),
    publicKey: createPublicKey(privateKey)
      .export({ type: 'spki', format: 'der' })
      .toString('base64'),
    connectorFingerprint,
    cashPositionId,
    audience,
    binary,
    root,
  };
  await writeJson(path.join(directory, 'config.json'), config);
  const publicFields = {
    version: 1,
    deviceId: config.deviceId,
    name: config.name,
    publicKey: config.publicKey,
    connectorFingerprint,
    cashPositionId,
    audience,
    createdAt: now.toISOString(),
  };
  const enrollment = {
    ...publicFields,
    signature: sign(null, canonicalBytes(publicFields), privateKey).toString('base64'),
  };
  await writeJson(path.join(directory, 'enrollment.json'), enrollment);
  return enrollment;
}

export async function prepareEnrollment(options) {
  if (!path.isAbsolute(options.root ?? '')) throw new Error('An absolute workspace is required.');
  const directory = workerDirectory(options.root);
  await privateDirectory(path.join(options.root, '.local'));
  await privateDirectory(directory);
  return withWorkerLock(directory, 'enrollment', () => prepareIdentity(options));
}

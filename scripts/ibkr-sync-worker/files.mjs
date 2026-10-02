import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, rename, readFile, lstat, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { privateDirectory } from '../ibkr-sync-helper/audit.mjs';

export async function syncDirectory(directory) {
  const handle = await open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function privateWrite(target, bytes, { exclusive = false } = {}) {
  await privateDirectory(path.dirname(target));
  const temporary = exclusive ? target : `${target}.${randomUUID()}.tmp`;
  const handle = await open(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  if (!exclusive) await rename(temporary, target);
  await syncDirectory(path.dirname(target));
  if ((await readFile(target)).compare(Buffer.from(bytes)) !== 0)
    throw new Error('The private worker file could not be read back.');
}

export async function privateRead(target) {
  const info = await lstat(target);
  if (!info.isFile() || (info.mode & 0o077) !== 0)
    throw new Error('A worker file is not a private regular file.');
  return readFile(target, 'utf8');
}

export async function readJson(target, fallback) {
  try {
    return JSON.parse(await privateRead(target));
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw error;
  }
}

export const writeJson = (target, value, options) =>
  privateWrite(target, JSON.stringify(value, null, 2), options);

/** Setup operations share the worker's exclusive lock and never terminate its active work. */
export async function withWorkerLock(directory, purpose, operation) {
  await privateDirectory(directory);
  const lock = path.join(directory, 'run.lock');
  try {
    await mkdir(lock, { mode: 0o700 });
    await syncDirectory(directory);
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error(
        'A worker run or setup is active or interrupted. Review its lock before changing the worker.'
      );
    throw error;
  }
  try {
    await writeJson(
      path.join(lock, 'owner.json'),
      { pid: process.pid, purpose, startedAt: new Date().toISOString() },
      { exclusive: true }
    );
    return await operation();
  } finally {
    await rm(lock, { recursive: true });
    await syncDirectory(directory);
  }
}

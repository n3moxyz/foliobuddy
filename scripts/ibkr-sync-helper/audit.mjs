import { createHash } from 'node:crypto';
import { mkdir, chmod, open, readFile } from 'node:fs/promises';
import path from 'node:path';

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)])
    );
  return value;
}
export function hash(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
function check(value, message) {
  if (!value) throw new Error(message);
}
export async function privateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
}
export async function savePrivate(directory, name, value) {
  check(/^[a-z0-9-]+\.json$/.test(name), 'Invalid audit filename.');
  await privateDirectory(directory);
  const target = path.join(directory, name);
  const bytes = JSON.stringify(value, null, 2);
  const file = await open(target, 'wx', 0o600);
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
  const readback = await readFile(target, 'utf8');
  check(
    bytes === readback,
    'The private checkpoint could not be read back. Nothing will be applied.'
  );
  return hash(JSON.parse(readback));
}

/** Verify the exact capture, ownership, immutable ledger, history and preview hash. */
export function verifyCheckpoint(backup, capture, anchor, state) {
  const firstTime = Date.parse(capture?.first?.capturedAt);
  const secondTime = Date.parse(capture?.second?.capturedAt);
  check(
    Number.isFinite(firstTime) &&
      firstTime <= secondTime &&
      secondTime - firstTime <= 180000 &&
      Date.now() - firstTime <= 900000 &&
      secondTime <= Date.now() + 30000,
    'The broker capture expired before the checkpoint.'
  );
  check(
    backup?.version === 1 && hash(backup.source) === hash(capture),
    'The checkpoint contains a different broker capture.'
  );
  check(
    backup.captureHash === hash({ kind: 'sync', cashPositionId: anchor, source: capture }),
    'The checkpoint capture identity differs.'
  );
  const { before, after } = backup;
  check(
    Array.isArray(before) &&
      Array.isArray(after) &&
      before.length > 1 &&
      before.length <= 101 &&
      before.length === after.length,
    'The checkpoint is incomplete.'
  );
  check(
    new Set(before.map((row) => row.id)).size === before.length &&
      new Set(after.map((row) => row.id)).size === after.length,
    'The checkpoint contains duplicate positions.'
  );
  check(state === hash({ before, after }), 'The preview state differs from its checkpoint.');
  const owner = before.find((row) => row.id === anchor)?.userId;
  check(
    typeof owner === 'string' && owner.length > 0,
    'The checkpoint does not contain the owned cash anchor.'
  );
  const stable = ({
    quantity: _q,
    avgCostNative: _a,
    costCurrency: _c,
    ibkrContractId: _i,
    ibkrSyncedAt: _t,
    ibkrCash: _cash,
    ...row
  }) => row;
  for (const row of before) {
    const next = after.find((candidate) => candidate.id === row.id);
    for (const savedTime of [row.ibkrSyncedAt, row.ibkrCash?.capturedAt]) {
      check(
        savedTime == null ||
          (Number.isFinite(Date.parse(savedTime)) && Date.parse(savedTime) <= firstTime),
        'A newer sync or cash edit was saved after this capture started. Start a fresh sync.'
      );
    }
    check(
      row.userId === owner &&
        row.storageType === 'BROKERAGE' &&
        row.storageLocation === 'IBKR' &&
        row.custodyOf === null,
      'The checkpoint includes an unowned or non-IBKR record.'
    );
    check(
      next && hash(stable(row)) === hash(stable(next)),
      'The sync would change original USD records, identity or history.'
    );
    check(
      row.ibkrContractId == null || next.ibkrContractId === row.ibkrContractId,
      'The sync would change an existing broker contract.'
    );
    if (row.id === anchor) {
      check(
        next.asset?.category === 'CASH' &&
          next.asset.symbol === 'USD' &&
          next.ibkrCash?.source === 'ibkr' &&
          next.ibkrCash.capturedAt === capture.second.capturedAt &&
          next.ibkrSyncedAt === capture.second.capturedAt,
        'The cash checkpoint has a different source time.'
      );
      check(next.quantity === next.ibkrCash.netCashUsd, 'The cash checkpoint does not tally.');
      const base = capture.second.balances.find((b) => b.currency === 'BASE');
      const usd =
        capture.second.summary.currency === 'USD'
          ? 1
          : capture.second.balances.find((b) => b.currency === 'USD')?.exchange_rate;
      check(base && Number.isFinite(usd) && usd > 0, 'The broker cash conversion is incomplete.');
      const expectedCash = {
        source: 'ibkr',
        capturedAt: capture.second.capturedAt,
        baseCurrency: capture.second.summary.currency,
        baseCash: base.cash_balance,
        baseToUsd: 1 / usd,
        netCashUsd: base.cash_balance / usd,
        balances: capture.second.balances
          .filter((b) => b.currency !== 'BASE')
          .map((b) => ({
            currency: b.currency,
            cashBalance: b.cash_balance,
            fxRateToUsd: b.exchange_rate / usd,
          })),
      };
      check(
        hash(next.ibkrCash) === hash(expectedCash),
        'A currency cash or debt value differs from IBKR.'
      );
    } else {
      const holding = capture.second.positions.find((p) => p.contract_id === next.ibkrContractId);
      if (holding)
        check(
          next.quantity === holding.position &&
            next.avgCostNative === holding.average_price &&
            next.costCurrency === holding.currency &&
            next.ibkrSyncedAt === capture.second.capturedAt,
          'A checkpoint holding differs from IBKR.'
        );
      else {
        check(
          next.quantity === 0 &&
            next.avgCostNative === row.avgCostNative &&
            next.costCurrency === row.costCurrency,
          'A missing holding has an invalid close.'
        );
        if (row.quantity !== 0) {
          const code = row.asset.symbol.replace(/\.(KS|KQ|T|OL|SI|TW)$/, '');
          const sold = capture.executions
            .filter(
              (e) =>
                e.symbol === code &&
                e.currency === row.asset.nativeCurrency &&
                Date.parse(e.date) > Date.parse(row.ibkrSyncedAt) &&
                Date.parse(e.date) <= secondTime
            )
            .reduce((sum, e) => sum + (e.side === 'SELL' ? e.quantity : -e.quantity), 0);
          check(
            row.ibkrContractId && row.ibkrSyncedAt && Math.abs(sold - row.quantity) < 0.000001,
            'A missing holding lacks complete closing-sale evidence.'
          );
        }
      }
    }
  }
  check(
    capture.second.positions.every(
      (p) => after.filter((row) => row.ibkrContractId === p.contract_id).length === 1
    ),
    'A broker holding is missing from the checkpoint.'
  );
  return { owner, captureHash: backup.captureHash };
}

export function verifyReadback(readback, backup, capturedAt) {
  check(
    readback?.applied === false && typeof readback.runId === 'string' && readback.runId.length > 0,
    'Independent verification did not return a saved sync.'
  );
  // The server independently checks current rows and history hashes against its saved result.
  // Normalize only fields written by sync, allowing the same 2-ULP DB transport rounding.
  const near = (a, b) =>
    typeof a === 'number' &&
    typeof b === 'number' &&
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Math.abs(a - b) <= 2 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b), Number.MIN_VALUE);
  function numericTree(a, b) {
    if (near(a, b)) return b;
    if (Array.isArray(a) && Array.isArray(b)) return a.map((v, i) => numericTree(v, b[i]));
    if (a && b && typeof a === 'object' && typeof b === 'object')
      return Object.fromEntries(
        Object.entries(a).map(([key, value]) => [key, numericTree(value, b[key])])
      );
    return a;
  }
  check(
    Array.isArray(readback.after) && readback.after.length === backup.after.length,
    'The saved position count differs.'
  );
  const normalized = readback.after.map((row) => {
    const expected = backup.after.find((p) => p.id === row.id);
    check(expected, 'An unexpected position appeared in readback.');
    return {
      ...row,
      quantity: near(row.quantity, expected.quantity) ? expected.quantity : row.quantity,
      avgCostNative: near(row.avgCostNative, expected.avgCostNative)
        ? expected.avgCostNative
        : row.avgCostNative,
      ibkrCash: numericTree(row.ibkrCash, expected.ibkrCash),
    };
  });
  check(
    hash(normalized) === hash(backup.after) && hash(readback.before) === hash(backup.before),
    'Saved records or histories differ from the reviewed checkpoint.'
  );
  check(
    normalized.some(
      (row) => row.ibkrCash?.capturedAt === capturedAt && row.ibkrSyncedAt === capturedAt
    ),
    'The saved broker timestamp differs.'
  );
}

/**
 * Backfill historical Snapshot + SnapshotPosition rows for equity positions
 * that were just entered but have been held for weeks/months.
 *
 * Why: the Snapshot/SnapshotPosition tables only contain data for positions
 * present in the DB at snapshot time. After entering long-held equities today,
 * every pre-existing snapshot under-counts the portfolio, which causes (a) a
 * vertical cliff on the Dashboard chart today and (b) an incorrect YTD anchor.
 *
 * Design notes:
 * - Audit first, then apply. Re-running the script with the same inputs is
 *   deterministic: apply() always starts from the baseline captured in the
 *   audit file, not the current (possibly already-modified) DB state.
 * - Prior-purchase cash placeholders (EWY, LIONGLC) add to totalValueUsd but
 *   have no SnapshotPosition row — they'd be invisible to a "delete target
 *   rows and subtract deltas" rollback. That's why we persist a full audit
 *   snapshot and rely on it for rollback.
 * - SnapshotPosition has no unique constraint on (snapshotId, assetSymbol),
 *   so we delete-then-insert the target symbols inside a transaction rather
 *   than upserting.
 * - SGD-native assets (D05.SI, S68.SI, OV8.SI, LIONGLC) are converted per
 *   snapshot using snapshot.usdSgdRate (or the latest fxRate row as
 *   fallback), NOT the current FX rate — that's the whole reason we don't
 *   use YahooProvider.getHistoricalPrices().priceUsd directly.
 * - LIONGLC is a SG unit trust (LionGlobal Singapore Dividend Equity, Decum
 *   share class LCP211). If Yahoo doesn't have it, we interpolate NAV
 *   linearly from the purchase NAV (SGD 1.4673 = 100_000 / 68_153.43) to
 *   today's current NAV. Distributed dividends are implicit "value decline"
 *   since we don't model cash separately.
 *
 * Usage:
 *   tsx scripts/backfill-equity-snapshots.ts --dry
 *   tsx scripts/backfill-equity-snapshots.ts --apply
 *   tsx scripts/backfill-equity-snapshots.ts --rollback scripts/audit-<iso>.json
 */

import { prisma } from '../src/lib/prisma.js';
import { logger } from '../src/lib/logger.js';
import YahooFinance from 'yahoo-finance2';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------- Configuration ------------------------------------------------

interface BackfillConfig {
  symbol: string;
  quantity: number;
  /** null = treat as held for all snapshots (no pre-purchase period) */
  heldSince: string | null;
  priorCashUsd?: number;
  priorCashSgd?: number;
}

const BACKFILLS: BackfillConfig[] = [
  { symbol: 'D05.SI', quantity: 350, heldSince: null },
  { symbol: 'S68.SI', quantity: 800, heldSince: null },
  { symbol: 'OV8.SI', quantity: 2000, heldSince: null },
  { symbol: 'GLXY', quantity: 1178, heldSince: null },
  { symbol: 'EWY', quantity: 590, heldSince: '2026-03-05', priorCashUsd: 78_500 },
  { symbol: 'LIONGLOB', quantity: 68_153.43, heldSince: '2026-02-09', priorCashSgd: 100_000 },
];

const USD_SGD_FALLBACK = 1.35;

// ---------- Types --------------------------------------------------------

interface SnapshotBaseline {
  id: string;
  timestamp: string;
  totalValueUsd: number;
  totalValueSgd: number | null;
  usdSgdRate: number | null;
  btcPrice: number | null;
  ethPrice: number | null;
  dailyReturn: number | null;
  weeklyReturn: number | null;
  monthlyReturn: number | null;
  ytdReturn: number | null;
  athValueUsd: number | null;
  btcOutperform: number | null;
  ethOutperform: number | null;
}

interface SnapshotPositionBaseline {
  id: string;
  snapshotId: string;
  assetSymbol: string;
  quantity: number;
  priceUsd: number;
  valueUsd: number;
  allocation: number;
}

interface AuditFile {
  version: 1;
  generatedAt: string;
  userId: string;
  cutoffIso: string;
  backfills: BackfillConfig[];
  snapshots: SnapshotBaseline[];
  /** All SnapshotPosition rows (every asset, not just targets) for full restore */
  snapshotPositions: SnapshotPositionBaseline[];
}

interface NativePrice {
  /** Unix ms */
  timestamp: number;
  nativePrice: number;
  currency: 'USD' | 'SGD';
}

// ---------- Helpers ------------------------------------------------------

function parseArgs(argv: string[]): {
  mode: 'dry' | 'apply' | 'rollback';
  rollbackPath?: string;
  userId?: string;
} {
  const dry = argv.includes('--dry');
  const apply = argv.includes('--apply');
  const rollbackIdx = argv.indexOf('--rollback');
  const userIdFlag = argv.find((a) => a.startsWith('--user-id='));
  const userId = userIdFlag ? userIdFlag.slice('--user-id='.length) : undefined;
  if (rollbackIdx !== -1) {
    return { mode: 'rollback', rollbackPath: argv[rollbackIdx + 1], userId };
  }
  if (apply) return { mode: 'apply', userId };
  if (dry) return { mode: 'dry', userId };
  throw new Error('Pass one of: --dry, --apply, --rollback <audit.json>');
}

function log(line: string) {
  process.stdout.write(`${line}\n`);
}

/** Fallback to latest fxRate row when snapshot.usdSgdRate is null */
async function resolveUsdSgd(snapshot: SnapshotBaseline, fxFallback: number): Promise<number> {
  if (snapshot.usdSgdRate && snapshot.usdSgdRate > 0) return snapshot.usdSgdRate;
  return fxFallback;
}

/**
 * Forward-fill historical prices: snapshot timestamps may fall on weekends
 * or holidays where no close exists. Walk back up to 7 days to find the last
 * available close.
 */
function priceAt(
  nativePrices: NativePrice[],
  snapshotMs: number,
  maxBackfillDays = 7
): NativePrice | null {
  if (nativePrices.length === 0) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  // Find the last price at or before snapshotMs
  let best: NativePrice | null = null;
  for (const p of nativePrices) {
    if (p.timestamp <= snapshotMs && (!best || p.timestamp > best.timestamp)) {
      best = p;
    }
  }
  if (!best) {
    // Snapshot is before first historical price — use first available
    return nativePrices[0];
  }
  const gap = snapshotMs - best.timestamp;
  if (gap > maxBackfillDays * dayMs) {
    log(
      `  ! price gap ${Math.round(gap / dayMs)}d at ${new Date(snapshotMs).toISOString().slice(0, 10)} — using anyway`
    );
  }
  return best;
}

/**
 * Linear interpolation for LIONGLC when Yahoo historical data is unavailable.
 * Returns NAV in SGD at the requested timestamp, interpolating between
 * (heldSinceMs, purchaseNav) and (nowMs, currentNav).
 */
function interpolateNav(
  heldSinceMs: number,
  purchaseNav: number,
  nowMs: number,
  currentNav: number,
  targetMs: number
): number {
  if (targetMs <= heldSinceMs) return purchaseNav;
  if (targetMs >= nowMs) return currentNav;
  const frac = (targetMs - heldSinceMs) / (nowMs - heldSinceMs);
  return purchaseNav + (currentNav - purchaseNav) * frac;
}

// ---------- Main backfill pipeline --------------------------------------

async function loadBaseline(
  userId: string,
  cutoff: Date
): Promise<{ snapshots: SnapshotBaseline[]; positions: SnapshotPositionBaseline[] }> {
  const snapshots = await prisma.snapshot.findMany({
    where: { userId, timestamp: { lt: cutoff } },
    orderBy: { timestamp: 'asc' },
    select: {
      id: true,
      timestamp: true,
      totalValueUsd: true,
      totalValueSgd: true,
      usdSgdRate: true,
      btcPrice: true,
      ethPrice: true,
      dailyReturn: true,
      weeklyReturn: true,
      monthlyReturn: true,
      ytdReturn: true,
      athValueUsd: true,
      btcOutperform: true,
      ethOutperform: true,
    },
  });

  const snapshotIds = snapshots.map((s) => s.id);
  const positions = await prisma.snapshotPosition.findMany({
    where: { snapshotId: { in: snapshotIds } },
  });

  return {
    snapshots: snapshots.map((s) => ({
      ...s,
      timestamp: s.timestamp.toISOString(),
    })),
    positions,
  };
}

async function fetchHistoricalNativePrices(
  yahoo: InstanceType<typeof YahooFinance>,
  providerAssetId: string,
  fromDate: Date,
  toDate: Date
): Promise<NativePrice[]> {
  // Use yahoo-finance2 chart() — handles the crumb+cookie flow that raw
  // chart URLs fail on from datacenter IPs. Native (non-adjusted) close is
  // in the instrument's quote currency; we convert per snapshot using the
  // snapshot's stored FX rate, not a single "now" rate.
  const currency = inferCurrencyFromSymbol(providerAssetId);
  try {
    const res = await yahoo.chart(providerAssetId, {
      period1: fromDate,
      period2: toDate,
      interval: '1d',
    });
    type Quote = { date: Date | string; close?: number | null };
    return (res.quotes as Quote[])
      .filter((q): q is Quote & { close: number } => typeof q.close === 'number')
      .map((q) => ({
        timestamp: new Date(q.date).getTime(),
        nativePrice: q.close,
        currency,
      }));
  } catch (err) {
    log(
      `  ! Yahoo chart failed for ${providerAssetId}: ${err instanceof Error ? err.message : err}`
    );
    return [];
  }
}

function inferCurrencyFromSymbol(symbol: string): 'USD' | 'SGD' {
  return symbol.endsWith('.SI') ? 'SGD' : 'USD';
}

async function resolveAsset(symbol: string) {
  const asset = await prisma.asset.findFirst({
    where: { symbol: { equals: symbol } },
  });
  if (!asset) throw new Error(`Asset not found in DB: ${symbol}`);
  return asset;
}

interface EquitySnapshotPrice {
  symbol: string;
  /** USD value to add to snapshot.totalValueUsd */
  valueUsd: number;
  /** null if this is a pre-purchase cash placeholder (no SnapshotPosition row) */
  priceUsd: number | null;
  quantity: number | null;
  /** true = pre-purchase cash placeholder, false = held position */
  isCashPlaceholder: boolean;
}

async function computeContribution(
  cfg: BackfillConfig,
  snapshot: SnapshotBaseline,
  nativePrices: NativePrice[],
  liongleInterpolation: {
    heldSinceMs: number;
    purchaseNav: number;
    nowMs: number;
    currentNav: number;
  } | null,
  usdSgd: number
): Promise<EquitySnapshotPrice> {
  const snapshotMs = new Date(snapshot.timestamp).getTime();
  const heldSinceMs = cfg.heldSince ? new Date(cfg.heldSince).getTime() : -Infinity;

  // Pre-purchase period: add cash placeholder, no SnapshotPosition row
  if (snapshotMs < heldSinceMs) {
    let cashUsd = 0;
    if (cfg.priorCashUsd != null) cashUsd = cfg.priorCashUsd;
    else if (cfg.priorCashSgd != null) cashUsd = cfg.priorCashSgd / usdSgd;
    return {
      symbol: cfg.symbol,
      valueUsd: cashUsd,
      priceUsd: null,
      quantity: null,
      isCashPlaceholder: true,
    };
  }

  // Held at this snapshot: use historical or interpolated price
  let nativePrice: number;
  let currency: 'USD' | 'SGD';

  const historical = priceAt(nativePrices, snapshotMs);
  if (historical) {
    nativePrice = historical.nativePrice;
    currency = historical.currency;
  } else if (liongleInterpolation) {
    nativePrice = interpolateNav(
      liongleInterpolation.heldSinceMs,
      liongleInterpolation.purchaseNav,
      liongleInterpolation.nowMs,
      liongleInterpolation.currentNav,
      snapshotMs
    );
    currency = 'SGD';
  } else {
    throw new Error(`No price available for ${cfg.symbol} at ${snapshot.timestamp}`);
  }

  const priceUsd = currency === 'SGD' ? nativePrice / usdSgd : nativePrice;
  const valueUsd = cfg.quantity * priceUsd;

  return {
    symbol: cfg.symbol,
    valueUsd,
    priceUsd,
    quantity: cfg.quantity,
    isCashPlaceholder: false,
  };
}

/** Build the per-snapshot new state (totals, positions) without mutating the DB. */
async function planChanges(
  audit: AuditFile,
  prices: Map<string, NativePrice[]>,
  liongleCfg: BackfillConfig | null,
  liongleInterpolation: {
    heldSinceMs: number;
    purchaseNav: number;
    nowMs: number;
    currentNav: number;
  } | null,
  fxFallback: number
) {
  const plans: Array<{
    snapshot: SnapshotBaseline;
    newTotalValueUsd: number;
    newTotalValueSgd: number | null;
    usdSgd: number;
    newTargetPositions: Array<{
      symbol: string;
      quantity: number;
      priceUsd: number;
      valueUsd: number;
    }>;
    deltaUsd: number;
  }> = [];

  for (const snapshot of audit.snapshots) {
    const usdSgd = await resolveUsdSgd(snapshot, fxFallback);

    // Start from the BASELINE (audit) total, not current DB state. This is
    // what makes re-running idempotent — even if a previous apply() modified
    // the DB, we always compute deltas relative to the captured baseline.
    let newTotal = snapshot.totalValueUsd;
    const newTargetPositions: Array<{
      symbol: string;
      quantity: number;
      priceUsd: number;
      valueUsd: number;
    }> = [];

    // Subtract the contribution of any existing SnapshotPosition rows for
    // target symbols from baseline — they're stale (pre-backfill) and would
    // double-count when we add the authoritative new contribution below.
    const baselineTargetPositions = audit.snapshotPositions.filter(
      (p) =>
        p.snapshotId === snapshot.id &&
        BACKFILLS.some((b) => b.symbol === p.assetSymbol)
    );
    for (const stale of baselineTargetPositions) {
      newTotal -= stale.valueUsd;
    }

    for (const cfg of BACKFILLS) {
      const contribution = await computeContribution(
        cfg,
        snapshot,
        prices.get(cfg.symbol) ?? [],
        cfg.symbol === 'LIONGLOB' ? liongleInterpolation : null,
        usdSgd
      );

      newTotal += contribution.valueUsd;

      if (!contribution.isCashPlaceholder && contribution.priceUsd != null && contribution.quantity != null) {
        newTargetPositions.push({
          symbol: cfg.symbol,
          quantity: contribution.quantity,
          priceUsd: contribution.priceUsd,
          valueUsd: contribution.valueUsd,
        });
      }
    }

    const newTotalSgd = newTotal * usdSgd;

    plans.push({
      snapshot,
      newTotalValueUsd: newTotal,
      newTotalValueSgd: newTotalSgd,
      usdSgd,
      newTargetPositions,
      deltaUsd: newTotal - snapshot.totalValueUsd,
    });
    // Keep `liongleCfg` referenced so the closure captures the intended config
    // (silences "unused variable" linting while keeping the API symmetric).
    void liongleCfg;
  }

  return plans;
}

async function applyPlans(
  plans: Awaited<ReturnType<typeof planChanges>>,
  audit: AuditFile
) {
  for (const plan of plans) {
    const { snapshot, newTotalValueUsd, newTotalValueSgd, newTargetPositions } = plan;

    await prisma.$transaction(async (tx) => {
      // 1. Delete existing target SnapshotPosition rows (baseline); recreate.
      await tx.snapshotPosition.deleteMany({
        where: {
          snapshotId: snapshot.id,
          assetSymbol: { in: BACKFILLS.map((b) => b.symbol) },
        },
      });

      // 2. Insert fresh target rows
      if (newTargetPositions.length > 0) {
        await tx.snapshotPosition.createMany({
          data: newTargetPositions.map((p) => ({
            snapshotId: snapshot.id,
            assetSymbol: p.symbol,
            quantity: p.quantity,
            priceUsd: p.priceUsd,
            valueUsd: p.valueUsd,
            // allocation recomputed in step 4
            allocation: 0,
          })),
        });
      }

      // 3. Update snapshot totals
      await tx.snapshot.update({
        where: { id: snapshot.id },
        data: {
          totalValueUsd: newTotalValueUsd,
          totalValueSgd: newTotalValueSgd,
        },
      });

      // 4. Recompute allocation on ALL SnapshotPosition rows for this snapshot
      //    (percentages are valueUsd / newTotalValueUsd * 100 for every asset)
      const allPositions = await tx.snapshotPosition.findMany({
        where: { snapshotId: snapshot.id },
      });
      for (const p of allPositions) {
        const allocation = newTotalValueUsd > 0 ? (p.valueUsd / newTotalValueUsd) * 100 : 0;
        await tx.snapshotPosition.update({
          where: { id: p.id },
          data: { allocation },
        });
      }
    });
  }

  // 5. After all totals are written, recompute cached performance metrics
  //    across the full affected range. This has to run after the totals
  //    phase because dailyReturn/weeklyReturn/monthlyReturn/ytdReturn all
  //    read other snapshots' updated totalValueUsd.
  await recomputeMetrics(audit);
}

async function recomputeMetrics(audit: AuditFile) {
  const userId = audit.userId;
  // Load ALL snapshots (including those outside the affected range) so we
  // can compute running metrics correctly.
  const all = await prisma.snapshot.findMany({
    where: { userId },
    orderBy: { timestamp: 'asc' },
  });

  // Affected snapshot IDs — we only WRITE these. Earlier snapshots are reads only.
  const affected = new Set(audit.snapshots.map((s) => s.id));

  const dayMs = 24 * 60 * 60 * 1000;

  // Running ATH over time (monotonic max of totalValueUsd)
  let athValue = -Infinity;

  // YTD anchor per calendar year
  const ytdByYear = new Map<number, { value: number; btcPrice: number | null; ethPrice: number | null }>();

  // First pass: populate YTD anchors and per-index lookup by timestamp
  for (const s of all) {
    const year = s.timestamp.getUTCFullYear();
    if (!ytdByYear.has(year)) {
      ytdByYear.set(year, {
        value: s.totalValueUsd,
        btcPrice: s.btcPrice,
        ethPrice: s.ethPrice,
      });
    }
  }

  for (const s of all) {
    athValue = Math.max(athValue, s.totalValueUsd);
    if (!affected.has(s.id)) continue;

    // Returns: look up snapshot closest to target date within ±12h window
    const findWithin = (targetMs: number) => {
      const lo = targetMs - 12 * 60 * 60 * 1000;
      const hi = targetMs + 12 * 60 * 60 * 1000;
      // Prefer the latest snapshot within the window (matches
      // snapshotService.getSnapshotByDate which orders timestamp desc)
      let best: (typeof all)[number] | null = null;
      for (const candidate of all) {
        const t = candidate.timestamp.getTime();
        if (t >= lo && t <= hi && (!best || t > best.timestamp.getTime())) {
          best = candidate;
        }
      }
      return best;
    };

    const ts = s.timestamp.getTime();
    const yesterday = findWithin(ts - dayMs);
    const lastWeek = findWithin(ts - 7 * dayMs);
    const lastMonth = findWithin(ts - 30 * dayMs);

    const dailyReturn =
      yesterday && yesterday.totalValueUsd > 0
        ? ((s.totalValueUsd - yesterday.totalValueUsd) / yesterday.totalValueUsd) * 100
        : null;
    const weeklyReturn =
      lastWeek && lastWeek.totalValueUsd > 0
        ? ((s.totalValueUsd - lastWeek.totalValueUsd) / lastWeek.totalValueUsd) * 100
        : null;
    const monthlyReturn =
      lastMonth && lastMonth.totalValueUsd > 0
        ? ((s.totalValueUsd - lastMonth.totalValueUsd) / lastMonth.totalValueUsd) * 100
        : null;

    const year = s.timestamp.getUTCFullYear();
    const ytd = ytdByYear.get(year);
    const ytdReturn =
      ytd && ytd.value > 0
        ? ((s.totalValueUsd - ytd.value) / ytd.value) * 100
        : null;

    let btcOutperform: number | null = null;
    let ethOutperform: number | null = null;
    if (ytd && ytdReturn !== null) {
      if (ytd.btcPrice && s.btcPrice) {
        const btcYtd = ((s.btcPrice - ytd.btcPrice) / ytd.btcPrice) * 100;
        btcOutperform = ytdReturn - btcYtd;
      }
      if (ytd.ethPrice && s.ethPrice) {
        const ethYtd = ((s.ethPrice - ytd.ethPrice) / ytd.ethPrice) * 100;
        ethOutperform = ytdReturn - ethYtd;
      }
    }

    await prisma.snapshot.update({
      where: { id: s.id },
      data: {
        athValueUsd: athValue,
        dailyReturn,
        weeklyReturn,
        monthlyReturn,
        ytdReturn,
        btcOutperform,
        ethOutperform,
      },
    });
  }
}

async function rollback(auditPath: string) {
  const raw = readFileSync(auditPath, 'utf-8');
  const audit = JSON.parse(raw) as AuditFile;
  if (audit.version !== 1) throw new Error('Unsupported audit version');

  log(`Rolling back ${audit.snapshots.length} snapshots from ${auditPath}`);

  for (const s of audit.snapshots) {
    await prisma.snapshot.update({
      where: { id: s.id },
      data: {
        totalValueUsd: s.totalValueUsd,
        totalValueSgd: s.totalValueSgd,
        dailyReturn: s.dailyReturn,
        weeklyReturn: s.weeklyReturn,
        monthlyReturn: s.monthlyReturn,
        ytdReturn: s.ytdReturn,
        athValueUsd: s.athValueUsd,
        btcOutperform: s.btcOutperform,
        ethOutperform: s.ethOutperform,
      },
    });
  }

  // Restore all SnapshotPosition rows: delete existing then recreate from audit
  const snapshotIds = audit.snapshots.map((s) => s.id);
  await prisma.$transaction([
    prisma.snapshotPosition.deleteMany({
      where: { snapshotId: { in: snapshotIds } },
    }),
    prisma.snapshotPosition.createMany({
      data: audit.snapshotPositions.map((p) => ({
        snapshotId: p.snapshotId,
        assetSymbol: p.assetSymbol,
        quantity: p.quantity,
        priceUsd: p.priceUsd,
        valueUsd: p.valueUsd,
        allocation: p.allocation,
      })),
    }),
  ]);

  log(`Rollback complete. ${audit.snapshots.length} snapshots restored.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.mode === 'rollback') {
    if (!args.rollbackPath) throw new Error('--rollback requires an audit file path');
    await rollback(args.rollbackPath);
    return;
  }

  // Resolve target user
  let userId: string;
  if (args.userId) {
    const u = await prisma.user.findUnique({ where: { id: args.userId } });
    if (!u) throw new Error(`User not found: ${args.userId}`);
    userId = u.id;
    log(`User: ${u.email} (${userId})`);
  } else {
    const users = await prisma.user.findMany({ select: { id: true, email: true } });
    if (users.length === 0) throw new Error('No users found');
    if (users.length > 1) {
      throw new Error(
        `Multiple users. Add --user-id=<id>: ${users.map((u) => u.id).join(', ')}`
      );
    }
    userId = users[0].id;
    log(`User: ${users[0].email} (${userId})`);
  }

  // Cutoff = max(Position.createdAt) for target positions.
  // Snapshots strictly before cutoff need backfill; anything at/after cutoff
  // was created with the positions in DB and doesn't need touching.
  const targetAssets = await Promise.all(BACKFILLS.map((b) => resolveAsset(b.symbol)));
  const targetAssetIds = targetAssets.map((a) => a.id);
  const targetPositions = await prisma.position.findMany({
    where: { userId, assetId: { in: targetAssetIds } },
    select: { id: true, assetId: true, createdAt: true, quantity: true },
  });
  if (targetPositions.length !== BACKFILLS.length) {
    throw new Error(
      `Expected ${BACKFILLS.length} target positions in DB, found ${targetPositions.length}`
    );
  }
  // Quantity sanity check
  for (const cfg of BACKFILLS) {
    const asset = targetAssets.find((a) => a.symbol === cfg.symbol)!;
    const pos = targetPositions.find((p) => p.assetId === asset.id)!;
    if (Math.abs(pos.quantity - cfg.quantity) > 0.01) {
      log(`  ! ${cfg.symbol}: DB qty ${pos.quantity} vs config ${cfg.quantity}`);
    }
  }
  const cutoff = new Date(
    Math.max(...targetPositions.map((p) => p.createdAt.getTime()))
  );
  log(`Cutoff: ${cutoff.toISOString()} (max Position.createdAt across targets)`);

  // Fetch historical prices for each target
  const YahooCtor = YahooFinance as unknown as new () => InstanceType<typeof YahooFinance>;
  const yahoo = new YahooCtor();
  const prices = new Map<string, NativePrice[]>();
  // Pull a generous window: from 2 weeks before the earliest relevant date
  // (to cover weekend forward-fill) through today.
  const earliestHeldSinceMs = Math.min(
    ...BACKFILLS.filter((b) => b.heldSince).map((b) => new Date(b.heldSince!).getTime()),
    new Date('2026-01-01').getTime()
  );
  const fetchFrom = new Date(earliestHeldSinceMs - 14 * 24 * 60 * 60 * 1000);
  const fetchTo = new Date();

  for (const cfg of BACKFILLS) {
    const asset = targetAssets.find((a) => a.symbol === cfg.symbol)!;
    const providerAssetId = asset.providerAssetId ?? asset.symbol;
    const pts = await fetchHistoricalNativePrices(yahoo, providerAssetId, fetchFrom, fetchTo);
    prices.set(cfg.symbol, pts);
    log(
      `  ${cfg.symbol} (${providerAssetId}): fetched ${pts.length} historical points from Yahoo`
    );
  }

  // LIONGLC fallback: if Yahoo returned no data, prepare linear interpolation
  const liongleCfg = BACKFILLS.find((b) => b.symbol === 'LIONGLOB')!;
  const liongleAsset = targetAssets.find((a) => a.symbol === 'LIONGLOB')!;
  const liongleHasYahoo = (prices.get('LIONGLOB') ?? []).length > 0;
  let liongleInterpolation: {
    heldSinceMs: number;
    purchaseNav: number;
    nowMs: number;
    currentNav: number;
  } | null = null;
  if (!liongleHasYahoo) {
    // Current NAV in SGD: asset.currentPriceUsd is USD; multiply by latest FX
    const latestFx = await prisma.fxRate.findUnique({
      where: { fromCcy_toCcy: { fromCcy: 'USD', toCcy: 'SGD' } },
    });
    const fx = latestFx?.rate ?? USD_SGD_FALLBACK;
    const currentNavSgd = (liongleAsset.currentPriceUsd ?? (1.18 / fx)) * fx;
    const purchaseNav = liongleCfg.priorCashSgd! / liongleCfg.quantity;
    liongleInterpolation = {
      heldSinceMs: new Date(liongleCfg.heldSince!).getTime(),
      purchaseNav,
      nowMs: Date.now(),
      currentNav: currentNavSgd,
    };
    log(
      `  LIONGLC: no Yahoo data, interpolating SGD ${purchaseNav.toFixed(4)} → ${currentNavSgd.toFixed(4)}`
    );
  }

  // Load baseline state
  const { snapshots, positions } = await loadBaseline(userId, cutoff);
  log(`Baseline: ${snapshots.length} snapshots, ${positions.length} SnapshotPosition rows`);

  if (snapshots.length === 0) {
    log('No snapshots to process. Done.');
    return;
  }

  // Build audit file before any write
  const audit: AuditFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    userId,
    cutoffIso: cutoff.toISOString(),
    backfills: BACKFILLS,
    snapshots,
    snapshotPositions: positions,
  };

  // Latest FX rate for fallback
  const fxRow = await prisma.fxRate.findUnique({
    where: { fromCcy_toCcy: { fromCcy: 'USD', toCcy: 'SGD' } },
  });
  const fxFallback = fxRow?.rate ?? USD_SGD_FALLBACK;

  const plans = await planChanges(audit, prices, liongleCfg, liongleInterpolation, fxFallback);

  // Report
  log('\n--- Plan summary ---');
  log(`${'date'.padEnd(12)}  ${'oldUsd'.padStart(14)}  ${'newUsd'.padStart(14)}  ${'delta'.padStart(14)}  targets`);
  for (const p of plans) {
    const date = p.snapshot.timestamp.slice(0, 10);
    const symbols = p.newTargetPositions.map((t) => t.symbol).join(',');
    log(
      `${date.padEnd(12)}  ${p.snapshot.totalValueUsd.toFixed(0).padStart(14)}  ${p.newTotalValueUsd.toFixed(0).padStart(14)}  ${(p.deltaUsd >= 0 ? '+' : '') + p.deltaUsd.toFixed(0).padStart(13)}  ${symbols}`
    );
  }

  if (args.mode === 'dry') {
    const auditPath = resolve('scripts', `audit-${new Date().toISOString().replace(/[:.]/g, '-')}-DRY.json`);
    writeFileSync(auditPath, JSON.stringify(audit, null, 2));
    log(`\nDry run. Audit would be: ${auditPath}`);
    log('Run with --apply to write changes.');
    return;
  }

  // --apply
  const auditPath = resolve('scripts', `audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(auditPath, JSON.stringify(audit, null, 2));
  log(`\nAudit written: ${auditPath}`);
  log('Applying changes...');

  await applyPlans(plans, audit);

  log(`Done. ${plans.length} snapshots updated.`);
  log(`Rollback with: tsx scripts/backfill-equity-snapshots.ts --rollback ${auditPath}`);
}

main()
  .catch((err) => {
    logger.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

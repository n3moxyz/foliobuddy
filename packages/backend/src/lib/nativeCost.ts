import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { applyPositionDelta } from './domain.js';

export const costCurrencySchema = z.enum(['USD', 'SGD', 'JPY', 'TWD', 'KRW', 'NOK', 'GBP']);
export const nativeCostFields = {
  avgCostNative: z.number().finite().min(0).nullable().optional(),
  costCurrency: costCurrencySchema.nullable().optional(),
};

type NativePosition = {
  quantity: number;
  avgCostNative?: number | null;
  costCurrency?: string | null;
};
type NativePatch = { avgCostNative?: number | null; costCurrency?: string | null };
type Delta = {
  mode: 'add' | 'reduce';
  quantity: number;
  totalCostUsd?: number;
  proceedsUsd?: number;
  nativeAmount?: number;
  fxRateToUsd?: number;
};

export function validateNativeCost(
  patch: NativePatch,
  asset: { nativeCurrency: string; category: string }
) {
  const hasAverage = patch.avgCostNative != null;
  const hasCurrency = patch.costCurrency != null;
  if (hasAverage !== hasCurrency)
    throw new AppError('Native average and cost currency must be supplied together', 400);
  if (
    hasCurrency &&
    (patch.costCurrency !== asset.nativeCurrency ||
      !['EQUITY', 'ETF', 'UNIT_TRUST'].includes(asset.category))
  ) {
    throw new AppError('Native cost currency must match the equity or fund', 400);
  }
}

/** Native totals are derived on the server, independently of the retained USD ledger. */
export function nativeCostChange(existing: NativePosition, patch: NativePatch, delta?: Delta) {
  const tracked = existing.avgCostNative != null && !!existing.costCurrency;
  if (!delta) {
    const supplied = patch.avgCostNative !== undefined || patch.costCurrency !== undefined;
    if (supplied && (patch.avgCostNative === undefined || patch.costCurrency === undefined)) {
      throw new AppError('Native average and cost currency must be supplied together', 400);
    }
    return {
      position: supplied
        ? { avgCostNative: patch.avgCostNative ?? null, costCurrency: patch.costCurrency ?? null }
        : {},
      history: {
        costCurrency: supplied
          ? (patch.costCurrency ?? existing.costCurrency ?? null)
          : (existing.costCurrency ?? null),
        previousAvgCostNative: existing.avgCostNative ?? null,
        nextAvgCostNative: supplied
          ? (patch.avgCostNative ?? null)
          : (existing.avgCostNative ?? null),
      },
    };
  }
  if (!tracked) {
    if (
      delta.nativeAmount !== undefined ||
      patch.avgCostNative != null ||
      patch.costCurrency != null
    ) {
      throw new AppError('Reconcile the native baseline before adding native activity', 400);
    }
    return { position: {}, history: {} };
  }
  if (patch.costCurrency !== undefined && patch.costCurrency !== existing.costCurrency) {
    throw new AppError('A position delta cannot change its cost currency', 400);
  }
  if (delta.mode === 'add' && delta.nativeAmount === undefined) {
    throw new AppError('A native purchase amount is required for this position', 400);
  }
  if (delta.nativeAmount !== undefined) {
    if (!(delta.fxRateToUsd && Number.isFinite(delta.fxRateToUsd) && delta.fxRateToUsd > 0)) {
      throw new AppError('The entry conversion rate is required', 400);
    }
    const usd = delta.mode === 'add' ? delta.totalCostUsd : delta.proceedsUsd;
    const converted = delta.nativeAmount * delta.fxRateToUsd;
    if (usd == null || Math.abs(converted - usd) > 1e-8 * Math.max(1, Math.abs(usd))) {
      throw new AppError('Native amount and USD amount do not match the entry rate', 400);
    }
  } else if (delta.fxRateToUsd !== undefined) {
    throw new AppError('An entry rate requires a native amount', 400);
  }
  const result = applyPositionDelta({
    currentQuantity: existing.quantity,
    currentAvgCostUsd: existing.avgCostNative!,
    deltaQuantity: delta.quantity,
    mode: delta.mode,
    deltaTotalCostUsd: delta.nativeAmount,
  });
  // Preserve the average exactly on a partial sale; avoid subtraction round-off.
  const nextAverage =
    delta.mode === 'reduce' && result.nextQuantity > 0
      ? existing.avgCostNative!
      : result.nextAvgCostUsd;
  if (
    patch.avgCostNative !== undefined &&
    patch.avgCostNative !== null &&
    Math.abs(patch.avgCostNative - nextAverage) > 1e-8 * Math.max(1, nextAverage)
  ) {
    throw new AppError('Native delta does not match the submitted average', 400);
  }
  return {
    position: { avgCostNative: nextAverage, costCurrency: existing.costCurrency! },
    history: {
      costCurrency: existing.costCurrency!,
      costBasisNative: result.deltaCostUsd,
      previousAvgCostNative: existing.avgCostNative!,
      nextAvgCostNative: nextAverage,
      proceedsNative: delta.mode === 'reduce' ? (delta.nativeAmount ?? null) : null,
      fxRateToUsd: delta.fxRateToUsd ?? null,
    },
  };
}

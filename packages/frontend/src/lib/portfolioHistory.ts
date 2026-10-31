import {
  downsampleLTTB,
  formatTooltipDate,
  formatXAxisDate,
  normalizeToPercentChange,
  type DatedPortfolioValue,
} from '@/lib/chartUtils';
import type { PerformancePoint } from '@/lib/types';

export const PORTFOLIO_MILESTONE_LABELS = {
  ath: 'YTD ATH',
  mdd: 'MDD',
  daily: 'MDD (1D)',
  live: 'Today (Live)',
} as const;

export const PORTFOLIO_MILESTONE_EXPLANATIONS = {
  ath: 'The highest recorded USD portfolio value this year, including the live value.',
  mdd: "The trough of this year's largest peak-to-trough decline, measured in USD.",
  daily:
    'The largest USD decline between the last recorded values on consecutive calendar days. Today uses the live value. Missing days are excluded.',
  live: "Your latest portfolio value. The percentage shows its current decline from this year's USD high.",
} as const;

export interface PortfolioMilestone extends DatedPortfolioValue {
  kind: keyof typeof PORTFOLIO_MILESTONE_LABELS;
  drawdownPct?: number | null;
}

/** Keep historical observations and the current quote, including intraday updates. */
export function portfolioTimeline(
  history: PerformancePoint[],
  liveValueUsd: number | undefined,
  asOf: string
) {
  const cutoff = Date.parse(asOf);
  const byTime = new Map<number, PerformancePoint & { isLive: boolean }>();
  for (const point of history) {
    const time = Date.parse(point.timestamp);
    if (Number.isFinite(time) && time <= cutoff) byTime.set(time, { ...point, isLive: false });
  }

  if (
    typeof liveValueUsd === 'number' &&
    Number.isFinite(liveValueUsd) &&
    liveValueUsd > 0 &&
    Number.isFinite(cutoff)
  ) {
    byTime.set(cutoff, {
      timestamp: asOf,
      totalValueUsd: liveValueUsd,
      totalValueSgd: null,
      unrealizedPnL: null,
      btcPrice: null,
      ethPrice: null,
      isLive: true,
    });
  }
  return [...byTime.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

export function formatMilestoneDate(timestamp: string | null | undefined): string | null {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return null;
  return new Date(timestamp).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function buildPortfolioChartData({
  history,
  liveValueUsd,
  asOf,
  milestones,
  currency,
  fxRate,
  stakeMultiplier,
}: {
  history: PerformancePoint[];
  liveValueUsd?: number;
  asOf: string;
  milestones: PortfolioMilestone[];
  currency: 'USD' | 'SGD';
  fxRate: number;
  stakeMultiplier: number;
}) {
  const timeline = portfolioTimeline(history, liveValueUsd, asOf);
  if (timeline.length === 0) return [];
  const spanDays = Math.ceil(
    (Date.parse(timeline[timeline.length - 1].timestamp) - Date.parse(timeline[0].timestamp)) /
      86_400_000
  );
  const eventsByTime = new Map<number, PortfolioMilestone[]>();
  for (const milestone of milestones) {
    const time = Date.parse(milestone.timestamp);
    const events = eventsByTime.get(time) ?? [];
    events.push(milestone);
    eventsByTime.set(time, events);
  }

  const data = timeline.map((point) => {
    const fullValue =
      currency === 'SGD'
        ? (point.totalValueSgd ?? point.totalValueUsd * fxRate)
        : point.totalValueUsd;
    return {
      timestamp: point.timestamp,
      date: formatXAxisDate(point.timestamp, spanDays),
      tooltipDate: formatTooltipDate(point.timestamp),
      value: fullValue * stakeMultiplier,
      fullValue,
      isLive: point.isLive,
      milestones: eventsByTime.get(Date.parse(point.timestamp)) ?? [],
    };
  });

  // Preserve exact milestone observations when a long chart is downsampled.
  const sampled =
    data.length > 400
      ? [
          ...new Set([
            ...downsampleLTTB(
              data,
              300,
              (point) => Date.parse(point.timestamp),
              (point) => point.value
            ),
            ...data.filter((point) => point.milestones.length > 0),
          ]),
        ].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
      : data;
  const percentChanges = normalizeToPercentChange(sampled.map((point) => point.value));
  return sampled.map((point, index) => ({ ...point, percentChange: percentChanges[index] }));
}

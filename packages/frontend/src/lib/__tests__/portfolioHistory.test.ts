import { describe, expect, it, vi, afterEach } from 'vitest';
import { calculateDatedDrawdownStats, getDateRange } from '@/lib/chartUtils';
import {
  buildPortfolioChartData,
  portfolioTimeline,
  type PortfolioMilestone,
} from '@/lib/portfolioHistory';
import type { PerformancePoint } from '@/lib/types';

function point(day: number, value: number, hour = 12): PerformancePoint {
  return {
    timestamp: new Date(Date.UTC(2026, 0, day, hour)).toISOString(),
    totalValueUsd: value,
    totalValueSgd: null,
    unrealizedPnL: null,
    btcPrice: null,
    ethPrice: null,
  };
}

describe('dated portfolio statistics', () => {
  afterEach(() => vi.useRealTimers());

  it('includes the current day in YTD and uses the same UTC year as the summary', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-25T10:15:00Z'));
    expect(getDateRange('YTD')).toEqual({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-10-25T23:59:59.999Z',
    });
  });

  it('identifies the high and the distinct peak-to-trough and daily decline dates', () => {
    const history = [100, 200, 100, 300, 250, 200, 140].map((value, index) =>
      point(index + 1, value)
    );
    const stats = calculateDatedDrawdownStats(history);
    expect(stats.athPoint).toBe(history[3]);
    expect(stats.maxDrawdownPct).toBeCloseTo(53.3333);
    expect(stats.maxDrawdownPoint).toBe(history[6]);
    expect(stats.maxDailyDrawdownPct).toBe(50);
    expect(stats.maxDailyDrawdownPoint).toBe(history[2]);
  });

  it('keeps the first recorded high and trough when records tie', () => {
    const history = [100, 120, 90, 120, 90].map((value, index) => point(index + 1, value));
    const stats = calculateDatedDrawdownStats(history);
    expect(stats.athPoint).toBe(history[1]);
    expect(stats.maxDrawdownPoint).toBe(history[2]);
    expect(stats.maxDailyDrawdownPoint).toBe(history[2]);
  });

  it('uses the last value per calendar day and excludes gaps from daily drawdowns', () => {
    const history = [point(1, 100), point(2, 150, 8), point(2, 120), point(3, 108), point(6, 50)];
    const stats = calculateDatedDrawdownStats(history);
    expect(stats.maxDrawdownPoint).toBe(history[4]);
    expect(stats.maxDailyDrawdownPct).toBe(10);
    expect(stats.maxDailyDrawdownPoint).toBe(history[3]);
  });

  it('does not invent a decline date for rising, missing, or invalid history', () => {
    expect(calculateDatedDrawdownStats([])).toMatchObject({
      athPoint: null,
      maxDrawdownPoint: null,
    });
    expect(calculateDatedDrawdownStats([point(1, 100), point(2, 110)])).toMatchObject({
      maxDrawdownPct: 0,
      maxDrawdownPoint: null,
      maxDailyDrawdownPct: 0,
      maxDailyDrawdownPoint: null,
    });
    expect(calculateDatedDrawdownStats([point(1, 100), point(2, NaN), point(3, 80)])).toMatchObject(
      {
        maxDrawdownPct: 20,
        maxDailyDrawdownPct: null,
        maxDailyDrawdownPoint: null,
      }
    );
  });
});

describe('portfolio chart milestone data', () => {
  const asOf = '2026-01-08T12:00:00.000Z';
  const options = {
    currency: 'USD' as const,
    fxRate: 1.3,
    stakeMultiplier: 1,
    asOf,
    milestones: [] as PortfolioMilestone[],
  };

  it('keeps today’s snapshot and appends the live observation chronologically', () => {
    const timeline = portfolioTimeline([point(8, 120, 8), point(1, 100)], 110, asOf);
    expect(timeline.map((item) => item.totalValueUsd)).toEqual([100, 120, 110]);
    expect(timeline.at(-1)).toMatchObject({ timestamp: asOf, isLive: true });
    expect(portfolioTimeline([point(8, 120)], 110, asOf)).toHaveLength(1);
    expect(portfolioTimeline([point(1, 100), point(1, 100)], undefined, asOf)).toHaveLength(1);
  });

  it('shares coincident milestone observations and omits events outside the selected history', () => {
    const milestones: PortfolioMilestone[] = [
      { ...point(1, 100), kind: 'start' },
      { ...point(3, 80), kind: 'mdd', drawdownPct: 20 },
      { ...point(3, 80), kind: 'daily', drawdownPct: 20 },
    ];
    const data = buildPortfolioChartData({
      ...options,
      history: [point(3, 80), point(4, 90)],
      milestones,
    });
    expect(data[0].milestones.map((event) => event.kind)).toEqual(['mdd', 'daily']);
    expect(data.flatMap((item) => item.milestones)).toHaveLength(2);
  });

  it('preserves exact event points when downsampling long histories', () => {
    const history = Array.from({ length: 500 }, (_, index) =>
      point(index + 1, 100 + Math.sin(index) * 10)
    );
    const milestones: PortfolioMilestone[] = [{ ...history[251], kind: 'ath' }];
    const data = buildPortfolioChartData({
      ...options,
      asOf: point(501, 100).timestamp,
      history,
      milestones,
    });
    expect(data.length).toBeLessThanOrEqual(301);
    expect(data.find((item) => item.timestamp === history[251].timestamp)?.milestones).toEqual(
      milestones
    );
  });

  it('uses the plotted currency and stake consistently in money and percentage modes', () => {
    const data = buildPortfolioChartData({
      ...options,
      history: [point(1, 100), point(2, 120)],
      currency: 'SGD',
      stakeMultiplier: 0.5,
    });
    expect(data.map((item) => item.value)).toEqual([65, 78]);
    expect(data.map((item) => item.percentChange)).toEqual([0, 20]);
  });
});

import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PerformancePoint } from '@/lib/types';
import type { PortfolioMilestone } from '@/lib/portfolioHistory';
import { MASKED_MONEY_VALUE, usePrivacyStore } from '@/stores/privacyStore';
import { PortfolioChart } from '../PortfolioChart';

// Render the real Recharts plot at a fixed size. jsdom has no layout measurement.
vi.mock('recharts', async (importOriginal) => {
  const original = await importOriginal<typeof import('recharts')>();
  const { cloneElement } = await import('react');
  return {
    ...original,
    ResponsiveContainer: ({
      children,
    }: {
      children: ReactElement<{ width: number; height: number }>;
    }) => cloneElement(children, { width: 800, height: 300 }),
  };
});
vi.mock('@/hooks/usePortfolio', () => ({
  usePerformanceHistory: () => ({ data: performanceHistory, isLoading: false, isFetching: false }),
}));
vi.mock('../ChartCopyButton', () => ({ ChartCopyButton: () => null }));

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
afterAll(() => vi.unstubAllGlobals());

const history: PerformancePoint[] = [100, 120, 80, 110].map((value, index) => ({
  timestamp: `2026-01-0${index + 1}T12:00:00Z`,
  totalValueUsd: value,
  totalValueSgd: null,
  unrealizedPnL: null,
  btcPrice: null,
  ethPrice: null,
}));
const milestones: PortfolioMilestone[] = [
  { ...history[1], kind: 'ath' },
  { ...history[2], kind: 'mdd', drawdownPct: 33.33 },
  { ...history[2], kind: 'daily', drawdownPct: 33.33 },
  { ...history[3], kind: 'live', drawdownPct: 8.33 },
];
const props = { liveValueUsd: 110, liveTimestamp: history[3].timestamp, milestones };
let performanceHistory = history;
beforeEach(() => {
  performanceHistory = history;
});

const label = (container: HTMLElement, kind: string) =>
  container.querySelector(`[data-milestone-label="${kind}"]`);
const markerY = (container: HTMLElement, kinds: string) => {
  const transform = container
    .querySelector(`[data-portfolio-milestone="${kinds}"]`)
    ?.getAttribute('transform');
  return Number(transform?.match(/translate\([^,]+,\s*([^)]+)\)/)?.[1]);
};
const markerX = (container: HTMLElement, kinds: string) => {
  const transform = container
    .querySelector(`[data-portfolio-milestone="${kinds}"]`)
    ?.getAttribute('transform');
  return Number(transform?.match(/translate\(([^,]+),/)?.[1]);
};
// Chart height 300 minus the bottom margin (5) and the date axis (30).
const PLOT_BOTTOM = 265;
const LABEL_HALF_HEIGHT = 7;

describe('direct milestone labels', () => {
  afterEach(() => usePrivacyStore.setState({ valuesHidden: false }));

  it('labels each milestone on the plot and drops the legend row', () => {
    const { container } = render(<PortfolioChart {...props} />);
    expect(label(container, 'ath')).toHaveTextContent('YTD ATH $120.00');
    expect(label(container, 'mdd')).toHaveTextContent('MDD -33.33%');
    expect(label(container, 'daily')).toHaveTextContent('MDD (1D) -33.33%');
    expect(container.querySelector('[data-chart-end-label]')).toHaveTextContent('$110.00');
    expect(container.querySelector('[data-portfolio-milestone="mdd daily"]')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Portfolio chart milestones' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Help: Portfolio chart milestones' })).toBeVisible();
  });

  it('stacks labels that share a point so they never overlap', () => {
    const { container } = render(<PortfolioChart {...props} />);
    const mddY = Number(label(container, 'mdd')?.getAttribute('y'));
    const dailyY = Number(label(container, 'daily')?.getAttribute('y'));
    expect(Math.abs(dailyY - mddY)).toBeGreaterThanOrEqual(14);
  });

  it('flips trough labels above the point when they would reach the date axis', () => {
    const { container } = render(<PortfolioChart {...props} />);
    const troughY = markerY(container, 'mdd daily');
    for (const kind of ['mdd', 'daily']) {
      const y = Number(label(container, kind)?.getAttribute('y'));
      expect(y).toBeLessThan(troughY);
      expect(y + LABEL_HALF_HEIGHT).toBeLessThanOrEqual(PLOT_BOTTOM);
    }
  });

  it('keeps trough labels below the point when there is room', () => {
    performanceHistory = [60, 120, 90, 110].map((value, index) => ({
      ...history[index],
      totalValueUsd: value,
    }));
    const trough = { ...performanceHistory[2] };
    const { container } = render(
      <PortfolioChart
        {...props}
        milestones={[
          { ...performanceHistory[1], kind: 'ath' },
          { ...trough, kind: 'mdd', drawdownPct: 25 },
          { ...trough, kind: 'daily', drawdownPct: 18.18 },
          milestones[3],
        ]}
      />
    );
    const troughY = markerY(container, 'mdd daily');
    const dailyY = Number(label(container, 'daily')?.getAttribute('y'));
    expect(Number(label(container, 'mdd')?.getAttribute('y'))).toBeGreaterThan(troughY);
    expect(dailyY).toBeGreaterThan(troughY);
    expect(dailyY + LABEL_HALF_HEIGHT).toBeLessThanOrEqual(PLOT_BOTTOM);
  });

  it('keeps labels from neighbouring points apart', () => {
    // A worst day right before a mid-chart trough puts both drawdown labels side by side.
    const values = [80, 88, 96, 104, 112, 120, 118, 117, 116, 115, 95, 94, 96, 97, 98];
    performanceHistory = values.map((value, index) => ({
      ...history[0],
      timestamp: new Date(Date.UTC(2026, 0, index + 1, 12)).toISOString(),
      totalValueUsd: value,
    }));
    const at = (index: number) => performanceHistory[index];
    const last = at(values.length - 1);
    const { container } = render(
      <PortfolioChart
        liveValueUsd={last.totalValueUsd}
        liveTimestamp={last.timestamp}
        milestones={[
          { ...at(5), kind: 'ath' },
          { ...at(11), kind: 'mdd', drawdownPct: 21.67 },
          { ...at(10), kind: 'daily', drawdownPct: 17.39 },
          { ...last, kind: 'live', drawdownPct: 18.33 },
        ]}
      />
    );
    const mdd = label(container, 'mdd');
    const daily = label(container, 'daily');
    expect(mdd).toHaveTextContent('MDD -21.67%');
    expect(daily).toHaveTextContent('MDD (1D) -17.39%');
    expect(
      Math.abs(Number(mdd?.getAttribute('y')) - Number(daily?.getAttribute('y')))
    ).toBeGreaterThanOrEqual(14);
  });

  it('masks money labels while keeping drawdown percentages visible', () => {
    usePrivacyStore.setState({ valuesHidden: true });
    const { container } = render(<PortfolioChart {...props} />);
    expect(label(container, 'ath')).toHaveTextContent(`YTD ATH ${MASKED_MONEY_VALUE}`);
    expect(container.querySelector('[data-chart-end-label]')).toHaveTextContent(MASKED_MONEY_VALUE);
    expect(label(container, 'mdd')).toHaveTextContent('MDD -33.33%');
  });

  it('shows percentage labels in percentage mode', () => {
    const { container } = render(<PortfolioChart {...props} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Show portfolio value as percentage change' })
    );
    expect(label(container, 'ath')).toHaveTextContent('YTD ATH +20.00%');
    expect(container.querySelector('[data-chart-end-label]')).toHaveTextContent('+10.00%');
  });

  it('does not repeat the value when the live point sets the high', () => {
    const next = { timestamp: '2026-01-05T12:00:00Z', totalValueUsd: 130 };
    const { container } = render(
      <PortfolioChart
        liveValueUsd={130}
        liveTimestamp={next.timestamp}
        milestones={[
          { ...next, kind: 'ath' },
          milestones[1],
          milestones[2],
          { ...next, kind: 'live', drawdownPct: 0 },
        ]}
      />
    );
    expect(label(container, 'ath')?.textContent).toBe('YTD ATH');
    // It sits left of the point, clear of the end value on the right.
    expect(Number(label(container, 'ath')?.getAttribute('x'))).toBeLessThan(
      markerX(container, 'ath live')
    );
    expect(container.querySelector('[data-chart-end-label]')).toHaveTextContent('$130.00');
  });
});

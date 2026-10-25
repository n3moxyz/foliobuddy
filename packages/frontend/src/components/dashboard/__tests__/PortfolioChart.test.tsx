import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PerformancePoint } from '@/lib/types';
import type { PortfolioMilestone } from '@/lib/portfolioHistory';
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
  usePerformanceHistory: () => ({ data: history, isLoading: false, isFetching: false }),
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

describe('legend-linked chart highlights', () => {
  it('highlights only the matching point on hover and clears it on leave', async () => {
    const { container } = render(<PortfolioChart {...props} />);
    const high = container.querySelector('[data-portfolio-milestone="ath"]');
    const trough = container.querySelector('[data-portfolio-milestone="mdd daily"]');
    expect(high).toBeInTheDocument();
    expect(trough).toBeInTheDocument();
    expect(container.querySelector('[data-highlighted="true"]')).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Explain YTD ATH' });
    fireEvent.pointerMove(trigger, { pointerType: 'mouse' });
    await waitFor(() => expect(high).toHaveAttribute('data-highlighted', 'true'));
    expect(high?.querySelector('[data-milestone-highlight]')).toBeInTheDocument();
    expect(trough).not.toHaveAttribute('data-highlighted');
    fireEvent.pointerLeave(trigger, { pointerType: 'mouse' });
    fireEvent.pointerMove(document.body, { pointerType: 'mouse', clientX: 1000, clientY: 1000 });
    await waitFor(() =>
      expect(container.querySelector('[data-highlighted="true"]')).not.toBeInTheDocument()
    );
  });

  it('supports grouped events by keyboard and clears on dismissal or a display-mode change', async () => {
    const { container } = render(<PortfolioChart {...props} />);
    const trigger = screen.getByRole('button', { name: 'Explain MDD · MDD (1D)' });
    fireEvent.focus(trigger);
    await waitFor(() =>
      expect(container.querySelector('[data-portfolio-milestone="mdd daily"]')).toHaveAttribute(
        'data-highlighted',
        'true'
      )
    );
    expect(container.querySelectorAll('[data-milestone-highlight]')).toHaveLength(1);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    await waitFor(() =>
      expect(container.querySelectorAll('[data-milestone-highlight]')).toHaveLength(0)
    );
    fireEvent.focus(trigger);
    fireEvent.click(
      screen.getByRole('button', { name: 'Show portfolio value as percentage change' })
    );
    await waitFor(() =>
      expect(container.querySelectorAll('[data-milestone-highlight]')).toHaveLength(0)
    );
  });

  it('keeps the live selection on its updated point when it becomes the new high', async () => {
    const { container, rerender } = render(<PortfolioChart {...props} />);
    fireEvent.focus(screen.getByRole('button', { name: 'Explain Today (Live)' }));
    await waitFor(() =>
      expect(container.querySelector('[data-portfolio-milestone="live"]')).toHaveAttribute(
        'data-highlighted',
        'true'
      )
    );
    const next = { timestamp: '2026-01-05T12:00:00Z', totalValueUsd: 130 };
    rerender(
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
    await waitFor(() =>
      expect(container.querySelector('[data-portfolio-milestone="ath live"]')).toHaveAttribute(
        'data-highlighted',
        'true'
      )
    );
    expect(container.querySelectorAll('[data-milestone-highlight]')).toHaveLength(1);
    expect(screen.getByRole('tooltip')).toHaveTextContent('5 Jan 2026');
  });
});

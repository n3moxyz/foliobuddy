import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PortfolioMilestone } from '@/lib/portfolioHistory';
import { PortfolioMilestoneDetails, PortfolioMilestoneLegend } from '../PortfolioMilestoneLegend';

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

const events: PortfolioMilestone[] = [
  { kind: 'mdd', timestamp: '2026-07-30T12:00:00Z', totalValueUsd: 80, drawdownPct: 20 },
  { kind: 'daily', timestamp: '2026-07-30T12:00:00Z', totalValueUsd: 80, drawdownPct: 10 },
];

describe('portfolio milestone explanations', () => {
  it('explains both events at a shared point without exposing account amounts', () => {
    render(<PortfolioMilestoneDetails events={events} />);
    expect(screen.getByText('30 Jul 2026')).toBeInTheDocument();
    expect(screen.getByText('MDD · -20.00%')).toBeInTheDocument();
    expect(screen.getByText('MDD (1D) · -10.00%')).toBeInTheDocument();
    expect(screen.getByText(/trough of this year/)).toBeInTheDocument();
    expect(screen.getByText(/consecutive calendar days/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('$80');
  });

  it('opens a portaled explanation by tap and closes it on a second tap', async () => {
    const { container } = render(<PortfolioMilestoneLegend groups={[events]} />);
    const trigger = screen.getByRole('button', { name: 'Explain MDD · MDD (1D)' });
    expect(trigger).toHaveClass('min-h-11');
    fireEvent.click(trigger);
    const tooltip = screen.getByRole('tooltip');
    expect(within(tooltip).getByText(/consecutive calendar days/)).toBeInTheDocument();
    expect(container).not.toContainElement(tooltip);
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('opens on keyboard focus and dismisses with Escape', async () => {
    render(<PortfolioMilestoneLegend groups={[events]} />);
    const trigger = screen.getByRole('button', { name: 'Explain MDD · MDD (1D)' });
    fireEvent.focus(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('30 Jul 2026');
    fireEvent.keyDown(trigger, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });

  it('opens on mouse hover after the short delay', async () => {
    render(<PortfolioMilestoneLegend groups={[events]} />);
    const trigger = screen.getByRole('button', { name: 'Explain MDD · MDD (1D)' });
    fireEvent.pointerMove(trigger, { pointerType: 'mouse' });
    expect(await screen.findByRole('tooltip')).toHaveTextContent('MDD · -20.00%');
    fireEvent.pointerLeave(trigger, { pointerType: 'mouse' });
    fireEvent.pointerMove(document.body, { pointerType: 'mouse', clientX: 1000, clientY: 1000 });
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });
});

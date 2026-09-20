import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { PortfolioSummary } from '@/lib/types';
import { NetWorthCard } from '../NetWorthCard';

vi.mock('@/hooks/useAnimatedNumber', () => ({
  useAnimatedNumbers: (targets: Array<number | null | undefined>) =>
    targets.map((target) => target ?? 0),
}));

// Tailwind utilities that make an element the containing block of absolutely positioned children.
const POSITIONED_ANCESTOR = '.relative, .absolute, .fixed, .sticky';

const summary: PortfolioSummary = {
  totalValueUsd: 3_936_941,
  totalValueSgd: 5_040_643,
  totalCostBasis: 4_064_552,
  unrealizedPnL: -127_611,
  unrealizedPnLPct: -3.14,
  positionCount: 26,
  lastUpdated: '2026-08-12T00:00:00.000Z',
  ytdStartDate: '2026-01-01T00:00:00.000Z',
};

describe('NetWorthCard', () => {
  it('renders the requested metrics in one responsive scroll rail', () => {
    render(
      <MemoryRouter>
        <NetWorthCard
          summary={summary}
          currency="USD"
          ytdAthUsd={4_656_848}
          maxDrawdownPct={19.82}
          maxDailyDrawdownPct={7.57}
          drawdownFromAthPct={15.46}
          exposurePct={66.9}
          positionCount={26}
          closedTrades={21}
          investorLabel="ET"
        />
      </MemoryRouter>
    );

    const statCells = screen.getAllByTestId('net-worth-stat');
    const labels = statCells.map((cell) => cell.querySelector('p')?.textContent);

    expect(labels).toEqual([
      'YTD P&L',
      'YTD Start',
      'YTD ATH',
      'MDD',
      'MDD (1D)',
      'DD from ATH',
      'Exposure',
      'Positions',
      'Trades',
    ]);
    const rail = screen.getByRole('region', { name: 'Net worth statistics' });
    expect(rail).toHaveClass('overflow-x-auto', 'xl:overflow-visible');
    // scroll-snap-type only takes effect on the element that scrolls, never on the grid inside it.
    expect(rail).toHaveClass('snap-x', 'snap-proximity', 'xl:snap-none');
    expect(rail.firstElementChild).not.toHaveClass('snap-x');
    // Scroll padding mirrors `px-4 sm:px-0`, or the first cell snaps under the mobile gutter.
    expect(rail).toHaveClass('px-4', 'scroll-px-4', 'sm:px-0', 'sm:scroll-px-0');
    expect(rail.firstElementChild).toHaveClass('grid-flow-col', 'xl:grid-cols-9');
    expect(within(statCells[0]).getByText('-3.14%')).toHaveClass('block', '2xl:inline');
    expect(screen.getByText('$4,656,848')).toBeInTheDocument();
    expect(screen.getByText('-19.82%')).toBeInTheDocument();
    expect(screen.getByText('-15.46%')).toBeInTheDocument();
  });

  it('keeps screen-reader-only link text contained by the scroll rail', () => {
    render(
      <MemoryRouter>
        <NetWorthCard
          summary={summary}
          currency="USD"
          exposurePct={66.9}
          positionCount={26}
          closedTrades={21}
        />
      </MemoryRouter>
    );

    const rail = screen.getByRole('region', { name: 'Net worth statistics' });
    const linkTexts = within(rail)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(linkTexts).toEqual([
      '66.9% — view portfolio',
      '26 positions — view portfolio',
      '21 trades — view trade journal',
    ]);

    // `sr-only` is position:absolute. When its nearest positioned ancestor sits outside the rail,
    // the rail neither clips nor scrolls it, so the whole Dashboard scrolls sideways below `xl`.
    const hiddenTexts = Array.from(rail.querySelectorAll('.sr-only'));
    expect(hiddenTexts).toHaveLength(3);
    for (const hiddenText of hiddenTexts) {
      const containingBlock =
        hiddenText.parentElement?.closest<HTMLElement>(POSITIONED_ANCESTOR) ?? null;
      expect(rail).toContainElement(containingBlock);
    }
  });

  it('renders the alternate-currency footer', () => {
    render(
      <MemoryRouter>
        <NetWorthCard summary={summary} currency="USD" />
      </MemoryRouter>
    );

    expect(screen.getByText(/SGD Value:/)).toHaveTextContent('SGD Value: S$5,040,643');
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TradeAnalytics } from '@/lib/types';
import { TradeStatsCard } from '../TradeStatsCard';

// Radix Popper (the help tooltips) measures with ResizeObserver, which jsdom doesn't implement.
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

afterAll(() => {
  vi.unstubAllGlobals();
});

const analytics: TradeAnalytics = {
  totalTrades: 10,
  winningTrades: 6,
  losingTrades: 4,
  winRate: 60,
  totalPnL: 500,
  avgPnL: 50,
  profitFactor: 2.25,
  avgWin: 150,
  avgLoss: 100,
  breakdown: {
    long: { count: 6, winRate: 66.7, pnl: 400 },
    short: { count: 4, winRate: 50, pnl: 100 },
  },
  bestTrade: null,
  worstTrade: null,
  monthlyBreakdown: [],
};

describe('TradeStatsCard risk : reward grade', () => {
  it.each([
    { avgWin: 250, avgLoss: 100, grade: 'Good' },
    // 1 : 1.5 is better than 1:1, so it must never read "Below 1:1".
    { avgWin: 150, avgLoss: 100, grade: 'Fair' },
    { avgWin: 50, avgLoss: 100, grade: 'Poor' },
  ])('grades avg win $avgWin vs avg loss $avgLoss as $grade', ({ avgWin, avgLoss, grade }) => {
    render(<TradeStatsCard analytics={{ ...analytics, avgWin, avgLoss }} />);

    expect(screen.getByText(grade)).toBeInTheDocument();
    expect(screen.queryByText('Below 1:1')).not.toBeInTheDocument();
  });
});

describe('TradeStatsCard collapsed summary', () => {
  it('spells out the win rate in whole percents, like the page subtitle', () => {
    render(<TradeStatsCard analytics={{ ...analytics, winRate: 63.64 }} isExpanded={false} />);

    // A non-breaking space keeps "win rate" on one line on phones.
    expect(screen.getByText('64% win rate').textContent).toBe('64% win rate');
    expect(screen.queryByText(/% WR$/)).not.toBeInTheDocument();
  });

  it('shows the trade count from sm up, in the singular for one trade', () => {
    render(<TradeStatsCard analytics={{ ...analytics, totalTrades: 1 }} isExpanded={false} />);

    // Phones stack P&L over the win rate and leave the count to the page subtitle.
    expect(screen.getByText('1 trade')).toHaveClass('hidden', 'sm:inline');
  });
});

describe('TradeStatsCard win and loss counts', () => {
  it('uses the singular for one win, one loss and one trade', () => {
    render(
      <TradeStatsCard
        analytics={{
          ...analytics,
          totalTrades: 1,
          winningTrades: 1,
          losingTrades: 1,
          winRate: 100,
        }}
      />
    );

    expect(screen.getByText('1 win')).toBeInTheDocument();
    expect(screen.getByText('Total: 1 trade')).toBeInTheDocument();
    expect(screen.getByText('1 loss')).toBeInTheDocument();
  });

  it('uses the plural otherwise', () => {
    render(<TradeStatsCard analytics={analytics} />);

    expect(screen.getByText('6 wins')).toBeInTheDocument();
    expect(screen.getByText('Total: 10 trades')).toBeInTheDocument();
    expect(screen.getByText('4 losses')).toBeInTheDocument();
  });
});

describe('TradeStatsCard accessibility', () => {
  it('opens each definition from a help button named after its term', () => {
    render(<TradeStatsCard analytics={analytics} />);

    for (const term of [
      'Total P&L',
      'Per Trade Avg',
      'Profit Factor',
      'Risk : Reward',
      'Win Rate',
      'Avg Win vs Avg Loss',
    ]) {
      expect(screen.getByRole('button', { name: `Help: ${term}` })).toBeInTheDocument();
    }

    // A click (or a tap) opens the definition; hover is not the only way in.
    fireEvent.click(screen.getByRole('button', { name: 'Help: Win Rate' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Winning trades ÷ closed trades.');
  });

  it('names each drag handle after its section, never its saved ID', () => {
    render(<TradeStatsCard analytics={analytics} />);

    const handles = screen.getAllByRole('button', { name: /^Reorder / });
    expect(handles.map((handle) => handle.getAttribute('aria-label'))).toEqual([
      'Reorder Key Metrics section',
      'Reorder Win Rate section',
      'Reorder Avg Win vs Avg Loss section',
      'Reorder By Direction section',
    ]);

    const instructions = document.getElementById(handles[1].getAttribute('aria-describedby')!);
    expect(instructions).toHaveTextContent(
      'To pick up this section, press Space or Enter. Use the up and down arrow keys to move it'
    );
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TradeAnalytics } from '@/lib/types';
import { TradeStatsCard } from '../TradeStatsCard';

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

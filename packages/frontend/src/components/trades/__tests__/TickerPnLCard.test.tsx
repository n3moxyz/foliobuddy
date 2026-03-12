import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TickerPnLCard } from '@/components/trades/TickerPnLCard';
import type { Trade } from '@/lib/types';

describe('TickerPnLCard', () => {
  it('aggregates closed trades and ignores open trades', () => {
    const trades = [
      { id: 't1', realizedPnL: 100, asset: { symbol: 'BTC' } },
      { id: 't2', realizedPnL: -50, asset: { symbol: 'BTC' } },
      { id: 't3', realizedPnL: 20, asset: { symbol: 'ETH' } },
      { id: 't4', realizedPnL: null, asset: { symbol: 'ETH' } },
    ] as Trade[];

    render(<TickerPnLCard trades={trades} currency="USD" fxRate={1} />);

    expect(screen.getByText('BTC')).toBeInTheDocument();
    expect(screen.getByText('ETH')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('calls onTickerClick when a row is clicked', () => {
    const onTickerClick = vi.fn();
    const trades = [
      { id: 't1', realizedPnL: 100, asset: { symbol: 'BTC' } },
      { id: 't2', realizedPnL: 20, asset: { symbol: 'ETH' } },
    ] as Trade[];

    render(
      <TickerPnLCard
        trades={trades}
        currency="USD"
        fxRate={1}
        onTickerClick={onTickerClick}
        isExpanded
      />
    );

    fireEvent.click(screen.getByText('BTC'));

    expect(onTickerClick).toHaveBeenCalledWith('BTC');
  });
});

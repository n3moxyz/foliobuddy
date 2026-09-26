import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TickerPnLCard } from '@/components/trades/TickerPnLCard';
import type { Trade } from '@/lib/types';

function closedTrade(
  id: string,
  realizedPnL: number | null,
  assetId: string,
  category = 'LIQUID_CRYPTO'
) {
  const symbol = assetId.split('-')[0].toUpperCase();
  return { id, realizedPnL, assetId, asset: { id: assetId, symbol, name: assetId, category } };
}

describe('TickerPnLCard', () => {
  it('aggregates closed trades and ignores open trades', () => {
    const trades = [
      closedTrade('t1', 100, 'btc'),
      closedTrade('t2', -50, 'btc'),
      closedTrade('t3', 20, 'eth'),
      closedTrade('t4', null, 'eth'),
    ] as Trade[];

    render(<TickerPnLCard trades={trades} currency="USD" fxRate={1} />);

    expect(screen.getByText('BTC')).toBeInTheDocument();
    expect(screen.getByText('ETH')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('calls onTickerClick with the clicked asset', () => {
    const onTickerClick = vi.fn();
    const trades = [closedTrade('t1', 100, 'btc'), closedTrade('t2', 20, 'eth')] as Trade[];

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

    expect(onTickerClick).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'btc', symbol: 'BTC' })
    );
  });

  it('keeps a coin and a same-ticker ETF on separate, labelled rows', () => {
    const onTickerClick = vi.fn();
    const trades = [
      closedTrade('t1', 100, 'btc-coin'),
      closedTrade('t2', -30, 'btc-etf', 'EQUITY'),
    ] as Trade[];

    render(
      <TickerPnLCard trades={trades} currency="USD" fxRate={1} onTickerClick={onTickerClick} />
    );

    expect(screen.getByText('BTC · Crypto')).toBeInTheDocument();
    fireEvent.click(screen.getByText('BTC · Equity'));

    expect(screen.getAllByText('1')).toHaveLength(2);
    expect(onTickerClick).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'btc-etf' }));
  });

  it('labels a coin by class even while the same-ticker ETF has only open trades', () => {
    const trades = [
      closedTrade('t1', 100, 'btc-coin'),
      closedTrade('t2', null, 'btc-etf', 'EQUITY'),
    ] as Trade[];

    render(<TickerPnLCard trades={trades} currency="USD" fxRate={1} />);

    expect(screen.getByText('BTC · Crypto')).toBeInTheDocument();
    expect(screen.queryByText('BTC · Equity')).not.toBeInTheDocument();
  });
});

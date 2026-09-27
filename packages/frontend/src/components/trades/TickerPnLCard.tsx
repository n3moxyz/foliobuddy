import { useMemo } from 'react';
import { CollapsibleCard } from '@/components/portfolio/CollapsibleCard';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { SortableHeader } from '@/components/ui/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';
import type { ColumnConfig } from '@/hooks/useTableSort';
import { getPnLColorClass } from '@/lib/utils';
import type { Trade } from '@/lib/types';
import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';
import { tickerLabels, type TickerRef } from './tradeLensModels';

interface TickerStat extends TickerRef {
  label: string;
  trades: number;
  wins: number;
  winRate: number;
  totalPnL: number;
}

interface TickerPnLCardProps {
  trades: Trade[];
  currency: 'USD' | 'SGD';
  fxRate: number;
  onTickerClick?: (ticker: TickerRef) => void;
  isExpanded?: boolean;
  onToggle?: () => void;
}

const TICKER_COLUMNS: Record<string, ColumnConfig<TickerStat>> = {
  symbol: { accessor: (t) => t.label, type: 'string' },
  trades: { accessor: (t) => t.trades, type: 'number' },
  winRate: { accessor: (t) => t.winRate, type: 'number' },
  totalPnL: { accessor: (t) => t.totalPnL, type: 'number' },
};

export function TickerPnLCard({
  trades,
  currency,
  fxRate,
  onTickerClick,
  isExpanded = true,
  onToggle,
}: TickerPnLCardProps) {
  const { formatCurrency } = useMoneyFormatter();
  const tickerStats = useMemo(() => {
    // Keyed by asset: a BTC coin and a BTC spot ETF share a ticker, not a P&L row.
    const map = new Map<string, TickerStat>();
    // Labels come from every traded asset, as in the dossier chips, so a coin
    // reads "BTC · Crypto" here too while the BTC ETF has only open trades.
    const assets = new Map<string, Trade['asset']>();
    for (const trade of trades) {
      assets.set(trade.assetId, { ...trade.asset, id: trade.assetId });
      if (trade.realizedPnL === null) continue;
      const key = trade.assetId;
      const existing = map.get(key) || {
        assetId: key,
        symbol: trade.asset.symbol,
        label: trade.asset.symbol,
        trades: 0,
        wins: 0,
        winRate: 0,
        totalPnL: 0,
      };
      existing.trades++;
      if (trade.realizedPnL > 0) existing.wins++;
      existing.totalPnL += trade.realizedPnL;
      map.set(key, existing);
    }
    const labels = tickerLabels([...assets.values()]);
    for (const stat of map.values()) {
      stat.label = labels.get(stat.assetId) ?? stat.symbol;
      stat.winRate = stat.trades > 0 ? (stat.wins / stat.trades) * 100 : 0;
    }
    return Array.from(map.values());
  }, [trades]);

  // Default sort: P&L descending — useTableSort starts unsorted, so we pre-sort the data
  const defaultSorted = useMemo(
    () => [...tickerStats].sort((a, b) => b.totalPnL - a.totalPnL),
    [tickerStats]
  );

  const { sortedItems, sortKey, sortDirection, onSort } = useTableSort(
    defaultSorted,
    TICKER_COLUMNS
  );

  const convert = (usd: number) => (currency === 'SGD' ? usd * fxRate : usd);

  if (tickerStats.length === 0) return null;

  return (
    <CollapsibleCard
      title="P&L by Ticker"
      isExpanded={isExpanded}
      onToggle={onToggle ?? (() => {})}
    >
      <div className="-mx-4 -mb-3 overflow-x-auto">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <SortableHeader
                label="Ticker"
                sortKey="symbol"
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
              />
              <SortableHeader
                label="Trades"
                sortKey="trades"
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
                align="right"
              />
              <SortableHeader
                label="Win Rate"
                sortKey="winRate"
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
                align="right"
              />
              <SortableHeader
                label="Total P&L"
                sortKey="totalPnL"
                activeSortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
                align="right"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedItems.map((stat) => (
              <TableRow
                key={stat.assetId}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => onTickerClick?.(stat)}
                tabIndex={0}
                aria-label={`Filter by ${stat.label}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onTickerClick?.(stat);
                  }
                }}
              >
                <TableCell className="font-medium py-2">{stat.label}</TableCell>
                <TableCell className="text-right tabular-nums py-2">{stat.trades}</TableCell>
                <TableCell
                  className={`text-right tabular-nums py-2 ${stat.winRate >= 50 ? 'text-profit' : 'text-loss'}`}
                >
                  {stat.winRate.toFixed(0)}%
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums font-mono py-2 ${getPnLColorClass(stat.totalPnL)}`}
                >
                  {formatCurrency(convert(stat.totalPnL), currency, 0)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </CollapsibleCard>
  );
}

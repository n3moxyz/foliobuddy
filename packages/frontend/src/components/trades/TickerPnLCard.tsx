import { useMemo } from 'react';
import { CollapsibleCard } from '@/components/portfolio/CollapsibleCard';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { SortableHeader } from '@/components/ui/SortableHeader';
import { useTableSort } from '@/hooks/useTableSort';
import type { ColumnConfig } from '@/hooks/useTableSort';
import { getPnLColorClass } from '@/lib/utils';
import type { Trade } from '@/lib/types';
import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';

interface TickerStat {
  symbol: string;
  trades: number;
  wins: number;
  winRate: number;
  totalPnL: number;
}

interface TickerPnLCardProps {
  trades: Trade[];
  currency: 'USD' | 'SGD';
  fxRate: number;
  onTickerClick?: (symbol: string) => void;
  isExpanded?: boolean;
  onToggle?: () => void;
}

const TICKER_COLUMNS: Record<string, ColumnConfig<TickerStat>> = {
  symbol: { accessor: (t) => t.symbol, type: 'string' },
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
    const map = new Map<string, TickerStat>();
    for (const trade of trades) {
      if (trade.realizedPnL === null) continue;
      const key = trade.asset.symbol;
      const existing = map.get(key) || { symbol: key, trades: 0, wins: 0, winRate: 0, totalPnL: 0 };
      existing.trades++;
      if (trade.realizedPnL > 0) existing.wins++;
      existing.totalPnL += trade.realizedPnL;
      map.set(key, existing);
    }
    // Calculate win rates
    for (const stat of map.values()) {
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
                key={stat.symbol}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => onTickerClick?.(stat.symbol)}
                tabIndex={0}
                aria-label={`Filter by ${stat.symbol}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onTickerClick?.(stat.symbol);
                  }
                }}
              >
                <TableCell className="font-medium py-2">{stat.symbol}</TableCell>
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

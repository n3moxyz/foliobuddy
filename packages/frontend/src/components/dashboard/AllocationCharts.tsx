import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { formatNumber, formatCurrency, isStablecoinCategory, categoryGroup } from '@/lib/utils';
import { ASSET_COLORS, STORAGE_COLORS, STABLES_COLORS } from '@/lib/chartColors';
import type { Position } from '@/lib/types';

interface AllocationChartsProps {
  positions: Position[];
  isLoading?: boolean;
}

interface ChartData {
  name: string;
  value: number;
  percentage: number;
}

type CategoryBucket = 'Crypto' | 'Equities' | 'Cash';

function bucketFor(category: string | undefined | null): CategoryBucket {
  const g = categoryGroup(category);
  if (g === 'stables') return 'Cash';
  if (g === 'equities' || g === 'unit_trusts') return 'Equities';
  return 'Crypto';
}

export function AllocationCharts({ positions, isLoading }: AllocationChartsProps) {
  // Track hidden items for each chart
  const [hiddenCategory, setHiddenCategory] = useState<Set<string>>(new Set());
  const [hiddenDetailed, setHiddenDetailed] = useState<Set<string>>(new Set());
  const [hiddenStorage, setHiddenStorage] = useState<Set<string>>(new Set());
  const [hiddenCash, setHiddenCash] = useState<Set<string>>(new Set());
  const [hoveredSlice, setHoveredSlice] = useState<Record<string, number | null>>({});

  // Calculate all allocations from positions
  const { categoryAllocation, detailedAllocation, storageAllocation, cashAllocation } =
    useMemo(() => {
      if (!positions || positions.length === 0) {
        return {
          categoryAllocation: [],
          detailedAllocation: [],
          storageAllocation: [],
          cashAllocation: [],
        };
      }

      const total = positions.reduce((sum, p) => sum + (p.marketValueUsd || 0), 0);

      // High-level category allocation: Crypto / Equities / Cash
      const categoryMap = new Map<CategoryBucket, number>([
        ['Crypto', 0],
        ['Equities', 0],
        ['Cash', 0],
      ]);

      positions.forEach((p) => {
        const bucket = bucketFor(p.asset.category);
        categoryMap.set(bucket, (categoryMap.get(bucket) || 0) + (p.marketValueUsd || 0));
      });

      const categoryData: ChartData[] = Array.from(categoryMap.entries())
        .filter(([, v]) => v > 0)
        .map(([name, value]) => ({
          name,
          value,
          percentage: total > 0 ? (value / total) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value);

      // Detailed asset allocation: crypto by symbol, equities + cash bundled
      const detailedMap = new Map<string, number>();
      let cashTotal = 0;
      let equitiesTotal = 0;

      positions.forEach((p) => {
        const value = p.marketValueUsd || 0;
        const bucket = bucketFor(p.asset.category);
        if (bucket === 'Cash') {
          cashTotal += value;
        } else if (bucket === 'Equities') {
          equitiesTotal += value;
        } else {
          const symbol = p.asset.symbol;
          detailedMap.set(symbol, (detailedMap.get(symbol) || 0) + value);
        }
      });

      if (cashTotal > 0) detailedMap.set('Cash', cashTotal);
      if (equitiesTotal > 0) detailedMap.set('Equities', equitiesTotal);

      const rawDetailed: ChartData[] = Array.from(detailedMap.entries())
        .map(([name, value]) => ({
          name,
          value,
          percentage: total > 0 ? (value / total) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value);

      // Group sub-2% crypto slices into "Other" once there are 2+ of them.
      // Cash and Equities are protected — always shown as their own wedge.
      const OTHER_THRESHOLD_PCT = 2;
      const isProtected = (name: string) => name === 'Cash' || name === 'Equities';
      const smallSlices = rawDetailed.filter(
        (d) => d.percentage < OTHER_THRESHOLD_PCT && !isProtected(d.name)
      );
      const detailedData: ChartData[] =
        smallSlices.length >= 2
          ? [
              ...rawDetailed.filter(
                (d) => d.percentage >= OTHER_THRESHOLD_PCT || isProtected(d.name)
              ),
              {
                name: 'Other',
                value: smallSlices.reduce((sum, d) => sum + d.value, 0),
                percentage: smallSlices.reduce((sum, d) => sum + d.percentage, 0),
              },
            ]
          : rawDetailed;

      // Storage allocation: CEX, Broker account, Bank, Onchain, Onchain Ledger
      const storageMap = new Map<string, number>();

      positions.forEach((p) => {
        const value = p.marketValueUsd || 0;
        let storageLabel: string;

        if (p.storageType === 'CEX') {
          storageLabel = 'CEX';
        } else if (p.storageType === 'BROKERAGE') {
          storageLabel = 'Broker account';
        } else if (p.storageType === 'BANK') {
          storageLabel = 'Bank';
        } else if (p.storageLocation?.toLowerCase().includes('ledger')) {
          storageLabel = 'Onchain Ledger';
        } else {
          storageLabel = 'Onchain';
        }

        storageMap.set(storageLabel, (storageMap.get(storageLabel) || 0) + value);
      });

      const storageData: ChartData[] = Array.from(storageMap.entries())
        .map(([name, value]) => ({
          name,
          value,
          percentage: total > 0 ? (value / total) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value);

      // Cash by type
      const cashMap = new Map<string, number>();

      positions.forEach((p) => {
        if (isStablecoinCategory(p.asset.category)) {
          const value = p.marketValueUsd || 0;
          const symbol = p.asset.symbol;
          cashMap.set(symbol, (cashMap.get(symbol) || 0) + value);
        }
      });

      const cashData: ChartData[] = Array.from(cashMap.entries())
        .map(([name, value]) => ({
          name,
          value,
          percentage: cashTotal > 0 ? (value / cashTotal) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value);

      return {
        categoryAllocation: categoryData,
        detailedAllocation: detailedData,
        storageAllocation: storageData,
        cashAllocation: cashData,
      };
    }, [positions]);

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 items-center">
                <Skeleton className="h-[120px] w-[120px] rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <Skeleton className="h-2.5 w-2.5 rounded-full" />
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-8 ml-auto" />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (positions.length === 0) {
    return null;
  }

  const toggleLegendItem = (
    name: string,
    hidden: Set<string>,
    setHidden: React.Dispatch<React.SetStateAction<Set<string>>>
  ) => {
    const newHidden = new Set(hidden);
    if (newHidden.has(name)) {
      newHidden.delete(name);
    } else {
      newHidden.add(name);
    }
    setHidden(newHidden);
  };

  const renderPieChart = (
    data: ChartData[],
    colors: string[],
    hidden: Set<string>,
    setHidden: React.Dispatch<React.SetStateAction<Set<string>>>,
    title: string
  ) => {
    const filteredData = data.filter((d) => !hidden.has(d.name));
    const visibleTotal = filteredData.reduce((sum, d) => sum + d.value, 0);
    const visibleData = filteredData.map((d) => ({
      ...d,
      displayPercentage: visibleTotal > 0 ? (d.value / visibleTotal) * 100 : 0,
    }));

    return (
      <Card className="flex-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="text-xs text-muted-foreground tabular-nums truncate min-h-[16px]">
            {(() => {
              const hIdx = hoveredSlice[title];
              if (hIdx == null || !visibleData[hIdx]) return null;
              const hovered = visibleData[hIdx];
              return (
                <>
                  {hovered.name} &middot; {formatCurrency(hovered.value, 'USD', true)} &middot;{' '}
                  {formatNumber(hovered.displayPercentage, 1)}%
                </>
              );
            })()}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center lg:flex-col lg:items-stretch lg:gap-3">
            <div className="mx-auto h-[140px] w-[140px] flex-shrink-0 relative sm:mx-0 lg:mx-auto">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={visibleData}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={60}
                    paddingAngle={2}
                    dataKey="value"
                    onMouseLeave={() => setHoveredSlice((prev) => ({ ...prev, [title]: null }))}
                  >
                    {visibleData.map((entry, i) => {
                      const originalIndex = data.findIndex((d) => d.name === entry.name);
                      return (
                        <Cell
                          key={`cell-${entry.name}`}
                          fill={colors[originalIndex % colors.length]}
                          onMouseEnter={() => setHoveredSlice((prev) => ({ ...prev, [title]: i }))}
                          style={{ cursor: 'pointer' }}
                        />
                      );
                    })}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              {visibleData.length > 0 &&
                (() => {
                  const top = visibleData.reduce((a, b) => (a.value > b.value ? a : b));
                  const shortName =
                    top.name.length > 8 ? top.name.slice(0, 7) + '\u2026' : top.name;
                  return (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-lg font-bold leading-tight">
                        {Math.round(top.displayPercentage)}%
                      </span>
                      <span className="text-[10px] text-muted-foreground leading-tight">
                        {shortName}
                      </span>
                    </div>
                  );
                })()}
            </div>

            <div className="flex min-w-0 flex-col gap-1.5 flex-1">
              {data.map((item, index) => {
                const isHidden = hidden.has(item.name);
                const displayPct = isHidden
                  ? item.percentage
                  : visibleTotal > 0
                    ? (item.value / visibleTotal) * 100
                    : 0;
                return (
                  <button
                    key={item.name}
                    className={`flex items-center gap-2 text-xs transition-colors cursor-pointer ${
                      isHidden ? 'opacity-40 line-through text-muted-foreground' : ''
                    }`}
                    aria-pressed={!hidden.has(item.name)}
                    onClick={() => toggleLegendItem(item.name, hidden, setHidden)}
                  >
                    <div
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-opacity ${
                        isHidden ? 'opacity-40' : ''
                      }`}
                      style={{ backgroundColor: colors[index % colors.length] }}
                    />
                    <span className="truncate">{item.name}</span>
                    <span
                      className={`ml-auto font-medium tabular-nums ${isHidden ? '' : 'text-muted-foreground'}`}
                    >
                      {formatNumber(displayPct, 0)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {renderPieChart(
        categoryAllocation,
        ASSET_COLORS,
        hiddenCategory,
        setHiddenCategory,
        'By Asset'
      )}
      {renderPieChart(
        detailedAllocation,
        ASSET_COLORS,
        hiddenDetailed,
        setHiddenDetailed,
        'By Detailed Asset'
      )}
      {renderPieChart(
        storageAllocation,
        STORAGE_COLORS,
        hiddenStorage,
        setHiddenStorage,
        'By Storage'
      )}
      {cashAllocation.length > 0 &&
        renderPieChart(cashAllocation, STABLES_COLORS, hiddenCash, setHiddenCash, 'Cash Breakdown')}
    </div>
  );
}

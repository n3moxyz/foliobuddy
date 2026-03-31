import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { formatCurrency, formatNumber } from '@/lib/utils';
import type { Position } from '@/lib/types';

interface AllocationChartsProps {
  positions: Position[];
  isLoading?: boolean;
}

// Color palettes — maximally distinct hues per chart,
// avoiding benchmark line colors (orange #F7931A, blue-purple #627EEA, teal #14B8A6, red #EF4444, purple #8B5CF6, amber #F59E0B)
const ASSET_COLORS = [
  '#BE185D',
  '#1D4ED8',
  '#059669',
  '#A21CAF',
  '#0891B2',
  '#854D0E',
  '#475569',
  '#B91C1C',
  '#4F46E5',
  '#65A30D',
];
const STORAGE_COLORS = ['#16A34A', '#0284C7', '#64748B'];
const STABLES_COLORS = ['#0369A1', '#16A34A', '#BE185D', '#854D0E', '#64748B'];

interface ChartData {
  name: string;
  value: number;
  percentage: number;
}

export function AllocationCharts({ positions, isLoading }: AllocationChartsProps) {
  // Track hidden items for each chart
  const [hiddenAssets, setHiddenAssets] = useState<Set<string>>(new Set());
  const [hiddenStorage, setHiddenStorage] = useState<Set<string>>(new Set());
  const [hiddenStables, setHiddenStables] = useState<Set<string>>(new Set());

  // Calculate all allocations from positions
  const { assetAllocation, storageAllocation, stablesAllocation } = useMemo(() => {
    if (!positions || positions.length === 0) {
      return { assetAllocation: [], storageAllocation: [], stablesAllocation: [], totalValue: 0 };
    }

    const total = positions.reduce((sum, p) => sum + (p.marketValueUsd || 0), 0);

    // Asset allocation: stables grouped, crypto by individual asset
    const assetMap = new Map<string, number>();
    let stablesTotal = 0;

    positions.forEach((p) => {
      const value = p.marketValueUsd || 0;
      if (p.asset.category === 'STABLECOIN' || p.asset.category === 'CASH') {
        stablesTotal += value;
      } else {
        const symbol = p.asset.symbol;
        assetMap.set(symbol, (assetMap.get(symbol) || 0) + value);
      }
    });

    // Add stables as one entry
    if (stablesTotal > 0) {
      assetMap.set('Stables', stablesTotal);
    }

    const assetData: ChartData[] = Array.from(assetMap.entries())
      .map(([name, value]) => ({
        name,
        value,
        percentage: total > 0 ? (value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

    // Storage allocation: CEX, Onchain, Onchain Ledger
    const storageMap = new Map<string, number>();

    positions.forEach((p) => {
      const value = p.marketValueUsd || 0;
      let storageLabel: string;

      if (p.storageType === 'CEX') {
        storageLabel = 'CEX';
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

    // Stables by type
    const stablesMap = new Map<string, number>();

    positions.forEach((p) => {
      if (p.asset.category === 'STABLECOIN' || p.asset.category === 'CASH') {
        const value = p.marketValueUsd || 0;
        const symbol = p.asset.symbol;
        stablesMap.set(symbol, (stablesMap.get(symbol) || 0) + value);
      }
    });

    const stablesData: ChartData[] = Array.from(stablesMap.entries())
      .map(([name, value]) => ({
        name,
        value,
        percentage: stablesTotal > 0 ? (value / stablesTotal) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

    return {
      assetAllocation: assetData,
      storageAllocation: storageData,
      stablesAllocation: stablesData,
      totalValue: total,
    };
  }, [positions]);

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
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

  // Track hovered slice index per chart for center label
  const [hoveredSlice, setHoveredSlice] = useState<Record<string, number | null>>({});

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
          <div className="flex items-baseline justify-between gap-3 min-h-[24px]">
            <CardTitle className="text-base flex-shrink-0">{title}</CardTitle>
            {/* Hover info — inline with title, no layout shift */}
            {(() => {
              const hIdx = hoveredSlice[title];
              if (hIdx == null || !visibleData[hIdx]) return null;
              const hovered = visibleData[hIdx];
              return (
                <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap truncate">
                  {hovered.name} &middot; {formatCurrency(hovered.value, 'USD', 0)} &middot; {formatNumber(hovered.displayPercentage, 1)}%
                </span>
              );
            })()}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* Donut Chart with Center Label */}
            <div className="mx-auto h-[140px] w-[140px] flex-shrink-0 relative sm:mx-0">
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
                            style={{ cursor: 'pointer', outline: 'none' }}
                          />
                        );
                      })}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                {/* Center label — always shows top visible item */}
                {visibleData.length > 0 &&
                  (() => {
                    const top = visibleData.reduce((a, b) => (a.value > b.value ? a : b));
                    const shortName = top.name.length > 8 ? top.name.slice(0, 7) + '\u2026' : top.name;
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

            {/* Side Legend */}
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
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
      {renderPieChart(assetAllocation, ASSET_COLORS, hiddenAssets, setHiddenAssets, 'By Asset')}
      {renderPieChart(
        storageAllocation,
        STORAGE_COLORS,
        hiddenStorage,
        setHiddenStorage,
        'By Storage'
      )}
      {stablesAllocation.length > 0 &&
        renderPieChart(
          stablesAllocation,
          STABLES_COLORS,
          hiddenStables,
          setHiddenStables,
          'Stables Breakdown'
        )}
    </div>
  );
}

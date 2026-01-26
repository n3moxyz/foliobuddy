import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatCurrency, formatNumber } from '@/lib/utils';
import type { Position } from '@/lib/api';

interface AllocationChartsProps {
  positions: Position[];
  isLoading?: boolean;
}

// Color palettes for each chart
const ASSET_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];
const STORAGE_COLORS = ['#3b82f6', '#10b981', '#8b5cf6'];
const STABLES_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

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

    positions.forEach(p => {
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

    positions.forEach(p => {
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

    positions.forEach(p => {
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
      <Card>
        <CardContent className="h-[300px] flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading allocations...</div>
        </CardContent>
      </Card>
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

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border rounded-lg shadow-lg p-3">
          <p className="font-medium">{data.name}</p>
          <p className="text-sm text-muted-foreground">
            {formatCurrency(data.value, 'USD', 0)}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatNumber(data.percentage, 1)}%
          </p>
        </div>
      );
    }
    return null;
  };

  const renderPieChart = (
    data: ChartData[],
    colors: string[],
    hidden: Set<string>,
    setHidden: React.Dispatch<React.SetStateAction<Set<string>>>,
    title: string
  ) => {
    const visibleData = data.filter(d => !hidden.has(d.name));

    return (
      <Card className="flex-1">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={visibleData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={2}
                dataKey="value"
              >
                {visibleData.map((entry) => {
                  const originalIndex = data.findIndex(d => d.name === entry.name);
                  return (
                    <Cell
                      key={`cell-${entry.name}`}
                      fill={colors[originalIndex % colors.length]}
                    />
                  );
                })}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Clickable Legend */}
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2">
            {data.map((item, index) => {
              const isHidden = hidden.has(item.name);
              return (
                <button
                  key={item.name}
                  className={`flex items-center gap-1.5 text-xs transition-all hover:opacity-80 ${
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
                  <span className="truncate max-w-[60px]">{item.name}</span>
                  <span className={isHidden ? '' : 'text-muted-foreground'}>
                    {formatNumber(item.percentage, 0)}%
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {renderPieChart(
        assetAllocation,
        ASSET_COLORS,
        hiddenAssets,
        setHiddenAssets,
        'By Asset'
      )}
      {renderPieChart(
        storageAllocation,
        STORAGE_COLORS,
        hiddenStorage,
        setHiddenStorage,
        'By Storage'
      )}
      {stablesAllocation.length > 0 && renderPieChart(
        stablesAllocation,
        STABLES_COLORS,
        hiddenStables,
        setHiddenStables,
        'Stables Breakdown'
      )}
    </div>
  );
}

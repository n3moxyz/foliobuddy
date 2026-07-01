import { useState, useMemo, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { formatNumber, formatCurrency, categoryGroup } from '@/lib/utils';
import { ASSET_COLORS, STORAGE_BREAKDOWN_COLORS, STABLES_COLORS } from '@/lib/chartColors';
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
type DetailedAssetFilter = 'auto' | 'all' | CategoryBucket;

const ALLOCATION_CHART_SKELETON_KEYS = ['asset', 'detailed', 'storage', 'cash'] as const;
const ALLOCATION_LEGEND_SKELETON_KEYS = ['first', 'second', 'third', 'fourth'] as const;
const DETAILED_ASSET_FILTER_OPTIONS: Array<{ value: DetailedAssetFilter; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'all', label: 'All' },
  { value: 'Crypto', label: 'Crypto' },
  { value: 'Cash', label: 'Cash' },
  { value: 'Equities', label: 'Equities' },
];

function bucketFor(category: string | undefined | null): CategoryBucket {
  const g = categoryGroup(category);
  if (g === 'stables') return 'Cash';
  if (g === 'equities' || g === 'unit_trusts') return 'Equities';
  return 'Crypto';
}

function mapToChartData(map: Map<string, number>, total: number): ChartData[] {
  return Array.from(map.entries())
    .filter(([, value]) => value > 0)
    .map(([name, value]) => ({
      name,
      value,
      percentage: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

function groupSmallDetailedSlices(data: ChartData[]): ChartData[] {
  const OTHER_THRESHOLD_PCT = 2;
  const isProtected = (name: string) => name === 'Cash' || name === 'Equities';
  const smallSlices = data.filter(
    (d) => d.percentage < OTHER_THRESHOLD_PCT && !isProtected(d.name)
  );

  if (smallSlices.length < 2) return data;

  return [
    ...data.filter((d) => d.percentage >= OTHER_THRESHOLD_PCT || isProtected(d.name)),
    {
      name: 'Other',
      value: smallSlices.reduce((sum, d) => sum + d.value, 0),
      percentage: smallSlices.reduce((sum, d) => sum + d.percentage, 0),
    },
  ];
}

// Storage donut keeps the meaningful custody anchors and rolls tiny custodians into "Other"
// so the chart stays readable as accounts are added.
const STORAGE_PROTECTED_SLICES = new Set(['CEX Cash', 'CEX Crypto', 'Onchain', 'Onchain Ledger']);

function groupSmallStorageSlices(data: ChartData[]): ChartData[] {
  const OTHER_THRESHOLD_PCT = 3;
  const smallSlices = data.filter(
    (d) => d.percentage < OTHER_THRESHOLD_PCT && !STORAGE_PROTECTED_SLICES.has(d.name)
  );

  if (smallSlices.length < 2) return data;

  return [
    ...data.filter(
      (d) => d.percentage >= OTHER_THRESHOLD_PCT || STORAGE_PROTECTED_SLICES.has(d.name)
    ),
    {
      name: 'Other',
      value: smallSlices.reduce((sum, d) => sum + d.value, 0),
      percentage: smallSlices.reduce((sum, d) => sum + d.percentage, 0),
    },
  ];
}

interface AllocationDonutProps {
  data: ChartData[];
  colors: string[];
  hidden: Set<string>;
  setHidden: React.Dispatch<React.SetStateAction<Set<string>>>;
  title: string;
  totalValue: number;
  headerControl?: React.ReactNode;
  onSliceClick?: (name: string) => void;
}

const AllocationDonut = memo(function AllocationDonut({
  data,
  colors,
  hidden,
  setHidden,
  title,
  totalValue,
  headerControl,
  onSliceClick,
}: AllocationDonutProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const toggleLegendItem = (name: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const filteredData = data.filter((d) => !hidden.has(d.name));
  const visibleTotal = filteredData.reduce((sum, d) => sum + d.value, 0);
  const visibleData = filteredData.map((d) => ({
    ...d,
    displayPercentage: visibleTotal > 0 ? (d.value / visibleTotal) * 100 : 0,
  }));

  return (
    <Card className="flex-1">
      <CardHeader className="pb-2">
        <div className="flex min-h-8 items-center">
          <CardTitle className="min-w-0 truncate text-base">
            {title}{' '}
            <span className="text-sm font-medium text-muted-foreground tabular-nums">
              ({formatCurrency(totalValue, 'USD', true)})
            </span>
          </CardTitle>
        </div>
        <div className="flex min-h-11 items-center gap-2 sm:min-h-8">
          <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground tabular-nums">
            {hoveredIndex != null && visibleData[hoveredIndex] ? (
              <>
                {visibleData[hoveredIndex].name} &middot;{' '}
                {formatCurrency(visibleData[hoveredIndex].value, 'USD', true)} &middot;{' '}
                {formatNumber(visibleData[hoveredIndex].displayPercentage, 1)}%
              </>
            ) : null}
          </div>
          {headerControl && <div className="shrink-0">{headerControl}</div>}
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
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {visibleData.map((entry, i) => {
                    const originalIndex = data.findIndex((d) => d.name === entry.name);
                    return (
                      <Cell
                        key={`cell-${entry.name}`}
                        fill={colors[originalIndex % colors.length]}
                        onMouseEnter={() => setHoveredIndex(i)}
                        onClick={onSliceClick ? () => onSliceClick(entry.name) : undefined}
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
                const shortName = top.name.length > 8 ? top.name.slice(0, 7) + '…' : top.name;
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

          {onSliceClick && (
            <p className="sr-only">
              Select a segment to filter the detailed breakdown. The category dropdown above the
              detailed chart provides the same filtering via keyboard.
            </p>
          )}

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
                  className={`flex min-h-11 items-center gap-2 text-xs transition-colors cursor-pointer md:min-h-0 ${
                    isHidden ? 'opacity-40 line-through text-muted-foreground' : ''
                  }`}
                  aria-pressed={!hidden.has(item.name)}
                  onClick={() => toggleLegendItem(item.name)}
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
});

export function AllocationCharts({ positions, isLoading }: AllocationChartsProps) {
  // Track hidden items for each chart
  const [hiddenCategory, setHiddenCategory] = useState<Set<string>>(new Set());
  const [hiddenDetailed, setHiddenDetailed] = useState<Set<string>>(new Set());
  const [hiddenStorage, setHiddenStorage] = useState<Set<string>>(new Set());
  const [hiddenCash, setHiddenCash] = useState<Set<string>>(new Set());
  const [detailedFilter, setDetailedFilter] = useState<DetailedAssetFilter>('auto');

  // Calculate all allocations from positions
  const {
    categoryAllocation,
    detailedAllocation,
    detailedByBucket,
    storageAllocation,
    cashAllocation,
    totals,
  } = useMemo(() => {
    if (!positions || positions.length === 0) {
      return {
        categoryAllocation: [],
        detailedAllocation: [],
        detailedByBucket: {
          Crypto: [],
          Cash: [],
          Equities: [],
        },
        storageAllocation: [],
        cashAllocation: [],
        totals: {
          portfolio: 0,
          crypto: 0,
          cash: 0,
          equities: 0,
        },
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
    const cryptoMap = new Map<string, number>();
    const cashMap = new Map<string, number>();
    const equitiesMap = new Map<string, number>();
    let cryptoTotal = 0;
    let cashTotal = 0;
    let equitiesTotal = 0;

    positions.forEach((p) => {
      const value = p.marketValueUsd || 0;
      const bucket = bucketFor(p.asset.category);
      if (bucket === 'Cash') {
        cashTotal += value;
        cashMap.set(p.asset.symbol, (cashMap.get(p.asset.symbol) || 0) + value);
      } else if (bucket === 'Equities') {
        equitiesTotal += value;
        equitiesMap.set(p.asset.symbol, (equitiesMap.get(p.asset.symbol) || 0) + value);
      } else {
        cryptoTotal += value;
        const symbol = p.asset.symbol;
        detailedMap.set(symbol, (detailedMap.get(symbol) || 0) + value);
        cryptoMap.set(symbol, (cryptoMap.get(symbol) || 0) + value);
      }
    });

    if (cashTotal > 0) detailedMap.set('Cash', cashTotal);
    if (equitiesTotal > 0) detailedMap.set('Equities', equitiesTotal);

    const rawDetailed = mapToChartData(detailedMap, total);
    const detailedData = groupSmallDetailedSlices(rawDetailed);
    const cryptoDetailedData = groupSmallDetailedSlices(mapToChartData(cryptoMap, cryptoTotal));
    const cashDetailedData = mapToChartData(cashMap, cashTotal);
    // Group equities too: once equities is the dominant bucket a many-ticker book
    // would otherwise render an unreadable donut of tiny arcs.
    const equitiesDetailedData = groupSmallDetailedSlices(
      mapToChartData(equitiesMap, equitiesTotal)
    );

    // Storage allocation: broker accounts by exact broker, plus CEX (split cash/crypto),
    // Bank, Onchain, Onchain Ledger; sub-3% custodians roll into "Other".
    const storageMap = new Map<string, number>();

    positions.forEach((p) => {
      const value = p.marketValueUsd || 0;
      let storageLabel: string;

      if (p.storageType === 'CEX') {
        // Split exchange holdings: stablecoin dry powder vs actual crypto exposure read
        // as very different counterparty risks even though they share a venue.
        storageLabel = bucketFor(p.asset.category) === 'Cash' ? 'CEX Cash' : 'CEX Crypto';
      } else if (p.storageType === 'BROKERAGE') {
        storageLabel = p.storageLocation?.trim() || 'Broker account';
      } else if (p.storageType === 'BANK') {
        storageLabel = 'Bank';
      } else if (p.storageLocation?.toLowerCase().includes('ledger')) {
        storageLabel = 'Onchain Ledger';
      } else {
        storageLabel = 'Onchain';
      }

      storageMap.set(storageLabel, (storageMap.get(storageLabel) || 0) + value);
    });

    const storageData: ChartData[] = groupSmallStorageSlices(
      Array.from(storageMap.entries())
        .map(([name, value]) => ({
          name,
          value,
          percentage: total > 0 ? (value / total) * 100 : 0,
        }))
        .sort((a, b) => b.value - a.value)
    );

    // Cash by type
    const cashData = cashDetailedData;

    return {
      categoryAllocation: categoryData,
      detailedAllocation: detailedData,
      detailedByBucket: {
        Crypto: cryptoDetailedData,
        Cash: cashDetailedData,
        Equities: equitiesDetailedData,
      },
      storageAllocation: storageData,
      cashAllocation: cashData,
      totals: {
        portfolio: total,
        crypto: cryptoTotal,
        cash: cashTotal,
        equities: equitiesTotal,
      },
    };
  }, [positions]);

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ALLOCATION_CHART_SKELETON_KEYS.map((chartKey) => (
          <Card key={chartKey}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 items-center">
                <Skeleton className="h-[120px] w-[120px] rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  {ALLOCATION_LEGEND_SKELETON_KEYS.map((legendKey) => (
                    <div key={`${chartKey}-${legendKey}`} className="flex items-center gap-2">
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

  const handleDetailedFilterChange = (value: string) => {
    setDetailedFilter(value as DetailedAssetFilter);
    setHiddenDetailed(new Set());
  };

  // Clicking a slice in the "By Asset" donut drills the detail chart into that bucket.
  const focusDetailedBucket = (name: string) => {
    if (name === 'Crypto' || name === 'Cash' || name === 'Equities') {
      setDetailedFilter(name);
      setHiddenDetailed(new Set());
    }
  };

  // "auto" follows the largest bucket so the detail view never goes stale as the
  // allocation rotates. Resolved at render time because it depends on loaded positions.
  // Cash is skipped here — it already has its own dedicated "Cash Breakdown" donut —
  // so auto never duplicates that chart (Cash stays reachable via the dropdown).
  const dominantBucket: CategoryBucket =
    (categoryAllocation.find((c) => c.name !== 'Cash')?.name as CategoryBucket) ?? 'Equities';
  const effectiveBucket: CategoryBucket =
    detailedFilter === 'auto' || detailedFilter === 'all' ? dominantBucket : detailedFilter;

  const selectedDetailedAllocation =
    detailedFilter === 'all' ? detailedAllocation : detailedByBucket[effectiveBucket];
  const selectedDetailedTotal =
    detailedFilter === 'all'
      ? totals.portfolio
      : effectiveBucket === 'Crypto'
        ? totals.crypto
        : effectiveBucket === 'Cash'
          ? totals.cash
          : totals.equities;
  const selectedDetailedColors =
    detailedFilter !== 'all' && effectiveBucket === 'Cash' ? STABLES_COLORS : ASSET_COLORS;
  const detailedTitle =
    detailedFilter === 'all' ? 'By Detailed Asset' : `${effectiveBucket} Breakdown`;
  const detailedHeaderControl = (
    <Select value={detailedFilter} onValueChange={handleDetailedFilterChange}>
      <SelectTrigger
        aria-label="Detailed asset category"
        className="h-11 w-[88px] border-0 bg-transparent px-1 text-xs text-muted-foreground shadow-none hover:bg-muted/40 focus:ring-1 focus:ring-ring focus:ring-offset-0 sm:h-8 sm:w-[78px] [&>svg]:h-3 [&>svg]:w-3"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DETAILED_ASSET_FILTER_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <AllocationDonut
        data={categoryAllocation}
        colors={ASSET_COLORS}
        hidden={hiddenCategory}
        setHidden={setHiddenCategory}
        title="By Asset"
        totalValue={totals.portfolio}
        onSliceClick={focusDetailedBucket}
      />
      <AllocationDonut
        data={selectedDetailedAllocation}
        colors={selectedDetailedColors}
        hidden={hiddenDetailed}
        setHidden={setHiddenDetailed}
        title={detailedTitle}
        totalValue={selectedDetailedTotal}
        headerControl={detailedHeaderControl}
      />
      <AllocationDonut
        data={storageAllocation}
        colors={STORAGE_BREAKDOWN_COLORS}
        hidden={hiddenStorage}
        setHidden={setHiddenStorage}
        title="By Storage"
        totalValue={totals.portfolio}
      />
      {cashAllocation.length > 0 && (
        <AllocationDonut
          data={cashAllocation}
          colors={STABLES_COLORS}
          hidden={hiddenCash}
          setHidden={setHiddenCash}
          title="Cash Breakdown"
          totalValue={totals.cash}
        />
      )}
    </div>
  );
}

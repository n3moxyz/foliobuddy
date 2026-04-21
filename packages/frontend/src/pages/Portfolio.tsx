import { useState, useMemo } from 'react';
import { usePositions, usePortfolioSummary, useDeleteAllPositions } from '@/hooks/usePortfolio';
import { useCurrencyStore } from '@/stores/currencyStore';
import { formatCurrency, formatPercent, getPnLColorClass, isStablecoinCategory } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PositionTable, copyPositionsToClipboard } from '@/components/portfolio/PositionTable';
import { CollapsibleCard } from '@/components/portfolio/CollapsibleCard';
import { PositionForm } from '@/components/portfolio/PositionForm';
import { UpdateNavModal } from '@/components/portfolio/UpdateNavModal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Pencil,
  Download,
  Copy,
  Check,
  Trash2,
  MoreVertical,
  FileSpreadsheet,
  Coins,
  Banknote,
  Users,
  Wallet,
  TrendingUp,
  TrendingDown,
  LineChart,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { useCollapsibleState } from '@/hooks/useCollapsibleState';
import type { Position } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpTooltip } from '@/components/ui/HelpTooltip';

const PERP_EXPOSURE_KEY = 'foliobuddy-perp-exposure';
const LEGACY_PERP_EXPOSURE_KEY = 'pa-portfolio-perp-exposure';

interface SectionConfig {
  id: string;
  label: string;
  filter: (p: Position) => boolean;
  icon: React.ReactNode;
  accentColor: string;
}

// Section config — add new categories here
const SECTION_CONFIG: SectionConfig[] = [
  {
    id: 'crypto',
    label: 'Crypto',
    filter: (p) =>
      p.asset.category !== 'EQUITY' &&
      p.asset.category !== 'UNIT_TRUST' &&
      !isStablecoinCategory(p.asset.category),
    icon: <Coins className="h-4 w-4 text-blue-500" />,
    accentColor: 'border-l-blue-500',
  },
  {
    id: 'stables',
    label: 'Stables',
    filter: (p) => isStablecoinCategory(p.asset.category),
    icon: <Banknote className="h-4 w-4 text-green-500" />,
    accentColor: 'border-l-green-500',
  },
  {
    id: 'equities',
    label: 'Equities',
    filter: (p) => p.asset.category === 'EQUITY',
    icon: <LineChart className="h-4 w-4 text-amber-500" />,
    accentColor: 'border-l-amber-500',
  },
  {
    id: 'unit_trusts',
    label: 'Unit Trusts',
    filter: (p) => p.asset.category === 'UNIT_TRUST',
    icon: <Wallet className="h-4 w-4 text-teal-500" />,
    accentColor: 'border-l-teal-500',
  },
];

export default function Portfolio() {
  const { currency } = useCurrencyStore();
  const { data: positions, isLoading: positionsLoading } = usePositions();
  const { data: summary } = usePortfolioSummary();
  const deleteAllMutation = useDeleteAllPositions();
  const [showAddForm, setShowAddForm] = useState(false);
  const [navAsset, setNavAsset] = useState<Position['asset'] | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  // Perp exposure state (migrates from legacy key on first load)
  const [perpExposure, setPerpExposure] = useState(() => {
    const legacy = localStorage.getItem(LEGACY_PERP_EXPOSURE_KEY);
    if (legacy !== null) {
      localStorage.setItem(PERP_EXPOSURE_KEY, legacy);
      localStorage.removeItem(LEGACY_PERP_EXPOSURE_KEY);
      return parseFloat(legacy) || 0;
    }
    const saved = localStorage.getItem(PERP_EXPOSURE_KEY);
    return saved ? parseFloat(saved) : 0;
  });
  const [editingPerp, setEditingPerp] = useState(false);
  const [perpInput, setPerpInput] = useState('');

  // Calculate FX rate from summary
  const fxRate = useMemo(() => {
    if (summary && summary.totalValueUsd > 0 && summary.totalValueSgd > 0) {
      return summary.totalValueSgd / summary.totalValueUsd;
    }
    return 1.35; // Default fallback rate
  }, [summary]);

  // Helper to convert values based on currency
  const convertValue = (usdValue: number | null | undefined) => {
    if (usdValue === null || usdValue === undefined) return usdValue;
    return currency === 'SGD' ? usdValue * fxRate : usdValue;
  };

  const handlePerpEdit = () => {
    setPerpInput(perpExposure.toString());
    setEditingPerp(true);
  };

  const handlePerpSave = () => {
    const value = parseFloat(perpInput) || 0;
    setPerpExposure(value);
    localStorage.setItem(PERP_EXPOSURE_KEY, value.toString());
    setEditingPerp(false);
  };

  const handlePerpKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePerpSave();
    } else if (e.key === 'Escape') {
      setEditingPerp(false);
    }
  };

  const { isExpanded, toggle } = useCollapsibleState();

  // Split positions: owned (custodyOf is null) vs custody (custodyOf is set)
  const { ownedPositions, custodyPositions } = useMemo(() => {
    if (!positions) return { ownedPositions: [] as Position[], custodyPositions: [] as Position[] };
    return {
      ownedPositions: positions.filter((p) => !p.custodyOf),
      custodyPositions: positions.filter((p) => !!p.custodyOf),
    };
  }, [positions]);

  // Build sections dynamically from config (owned positions only)
  const sections = useMemo(() => {
    return SECTION_CONFIG.map((config) => {
      const filtered = ownedPositions.filter(config.filter);
      return {
        ...config,
        positions: filtered,
        total: filtered.reduce((s, p) => s + (p.marketValueUsd || 0), 0),
        pnl: filtered.reduce((s, p) => s + (p.unrealizedPnL || 0), 0),
      };
    }).filter((s) => s.positions.length > 0);
  }, [ownedPositions]);

  // Custody section totals
  const custodyTotal = useMemo(() => {
    return custodyPositions.reduce((s, p) => s + (p.marketValueUsd || 0), 0);
  }, [custodyPositions]);

  // Unique custody names from existing positions (for dropdown)
  const existingCustodyNames = useMemo(() => {
    const names = new Set(custodyPositions.map((p) => p.custodyOf).filter(Boolean) as string[]);
    return Array.from(names).sort();
  }, [custodyPositions]);

  // Derived total for exposure calc in summary cards
  const cryptoTotal = sections.find((s) => s.id === 'crypto')?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Portfolio</h1>
          <p className="text-sm text-muted-foreground">{positions?.length ?? 0} positions</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={async () => {
              if (positions && positions.length > 0) {
                const success = await copyPositionsToClipboard(positions);
                if (success) {
                  setCopiedAll(true);
                  setTimeout(() => setCopiedAll(false), 2000);
                }
              }
            }}
            disabled={!positions || positions.length === 0}
          >
            {copiedAll ? (
              <Check className="h-4 w-4 mr-1 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 mr-1" />
            )}
            {copiedAll ? 'Copied!' : 'Copy All'}
          </Button>
          <Button size="sm" className="touch-manipulation" onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Position
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="touch-manipulation"
                aria-label="More options"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="sm:hidden"
                onClick={async () => {
                  if (positions && positions.length > 0) {
                    const success = await copyPositionsToClipboard(positions);
                    if (success) {
                      setCopiedAll(true);
                      setTimeout(() => setCopiedAll(false), 2000);
                    }
                  }
                }}
                disabled={!positions || positions.length === 0}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy All
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setShowDeleteAllConfirm(true)}
                disabled={!positions || positions.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete All
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open(api.exportPositionsCsv(), '_blank')}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open(api.exportExcel(), '_blank')}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {summary && (
        <div className="pb-6 mb-2 border-b">
          <div className="flex items-baseline gap-3 flex-wrap">
            <p className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums">
              {formatCurrency(convertValue(summary.totalValueUsd), currency, 0)}
            </p>
            {summary.unrealizedPnL !== 0 && (
              <span
                className={`inline-flex items-center gap-1 text-sm font-medium ${getPnLColorClass(summary.unrealizedPnL)}`}
              >
                {summary.unrealizedPnL >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                {formatCurrency(convertValue(summary.unrealizedPnL), currency, 0)} (
                {formatPercent(summary.unrealizedPnLPct)})
              </span>
            )}
          </div>

          <div className="mt-4 hidden sm:grid sm:grid-cols-4 divide-x divide-border">
            <div className="pr-4">
              <div className="flex items-center gap-1">
                <p className="text-muted-foreground text-sm">YTD Start</p>
                <HelpTooltip content="Your total cost basis — how much you invested" />
              </div>
              <p className="font-medium tabular-nums">
                {formatCurrency(convertValue(summary.totalCostBasis), currency, 0)}
              </p>
            </div>
            <div className="px-4">
              <div className="flex items-center gap-1">
                <p className="text-muted-foreground text-sm">Exposure</p>
                <HelpTooltip content="Percentage of portfolio in volatile crypto (excluding stablecoins)" />
              </div>
              <p className="font-medium tabular-nums">
                {summary.totalValueUsd > 0
                  ? `${(((cryptoTotal + perpExposure) / summary.totalValueUsd) * 100).toFixed(1)}%`
                  : '0%'}
              </p>
            </div>
            <div className="px-4">
              <div className="flex items-center gap-1">
                <p className="text-muted-foreground text-sm">Positions</p>
                <HelpTooltip content="Number of assets you currently hold" />
              </div>
              <p className="font-medium tabular-nums">{summary.positionCount}</p>
            </div>
            <div className="pl-4">
              <div className="flex items-center gap-1">
                <p className="text-muted-foreground text-sm">YTD P&L</p>
                <HelpTooltip content="Unrealized profit or loss since the start of the year" />
              </div>
              <p className={`font-medium tabular-nums ${getPnLColorClass(summary.unrealizedPnL)}`}>
                {formatCurrency(convertValue(summary.unrealizedPnL), currency, 0)}{' '}
                <span className="text-xs">({formatPercent(summary.unrealizedPnLPct)})</span>
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:hidden">
            <div>
              <div className="flex items-center gap-1">
                <p className="text-muted-foreground text-sm">YTD Start</p>
                <HelpTooltip content="Your total cost basis — how much you invested" />
              </div>
              <p className="font-medium tabular-nums">
                {formatCurrency(convertValue(summary.totalCostBasis), currency, 0)}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1">
                <p className="text-muted-foreground text-sm">Exposure</p>
                <HelpTooltip content="Percentage of portfolio in volatile crypto (excluding stablecoins)" />
              </div>
              <p className="font-medium tabular-nums">
                {summary.totalValueUsd > 0
                  ? `${(((cryptoTotal + perpExposure) / summary.totalValueUsd) * 100).toFixed(1)}%`
                  : '0%'}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1">
                <p className="text-muted-foreground text-sm">Positions</p>
                <HelpTooltip content="Number of assets you currently hold" />
              </div>
              <p className="font-medium tabular-nums">{summary.positionCount}</p>
            </div>
            <div>
              <div className="flex items-center gap-1">
                <p className="text-muted-foreground text-sm">YTD P&L</p>
                <HelpTooltip content="Unrealized profit or loss since the start of the year" />
              </div>
              <p className={`font-medium tabular-nums ${getPnLColorClass(summary.unrealizedPnL)}`}>
                {formatCurrency(convertValue(summary.unrealizedPnL), currency, 0)}{' '}
                <span className="text-xs">({formatPercent(summary.unrealizedPnLPct)})</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {positionsLoading && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="py-3 px-4">
                <Skeleton className="h-3 w-16 mb-2" />
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </div>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-md border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-24" />
                <div className="ml-auto">
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-10 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!positionsLoading && (!positions || positions.length === 0) && (
        <div className="py-16 text-center">
          <Wallet className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-1">No positions yet</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            Add your first crypto or stablecoin position to start tracking your portfolio value and
            P&L.
          </p>
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Position
          </Button>
        </div>
      )}

      {!positionsLoading &&
        sections.map((section) => (
          <CollapsibleCard
            key={section.id}
            title={`${section.label} (${section.positions.length})`}
            icon={section.icon}
            accentColor={section.accentColor}
            isExpanded={isExpanded(section.id)}
            onToggle={() => toggle(section.id)}
            headerRight={
              <div className="flex items-center gap-3">
                {!isExpanded(section.id) && (
                  <>
                    <span className="text-xs text-muted-foreground">
                      {section.positions.length} position{section.positions.length !== 1 ? 's' : ''}
                    </span>
                    {section.pnl !== 0 && (
                      <span className={`text-xs font-medium ${getPnLColorClass(section.pnl)}`}>
                        {formatCurrency(convertValue(section.pnl), currency, 0)}
                      </span>
                    )}
                  </>
                )}
                <span className="text-sm font-semibold text-muted-foreground">
                  {formatCurrency(convertValue(section.total), currency, 0)}
                </span>
              </div>
            }
            headerExtra={
              section.id === 'stables' ? (
                <div className="flex items-center justify-end gap-2 mt-1">
                  {perpExposure > 0 && (
                    <>
                      <span className="text-xs text-muted-foreground">
                        Available:{' '}
                        {formatCurrency(convertValue(section.total - perpExposure), currency, 0)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Perp:
                        <HelpTooltip content="Open perpetual futures position size — adds to your crypto exposure calculation" />{' '}
                        {formatCurrency(convertValue(perpExposure), currency, 0)}
                      </span>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePerpEdit();
                    }}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    {perpExposure > 0 ? 'Edit' : 'Add Perp'}
                  </Button>
                </div>
              ) : undefined
            }
          >
            <PositionTable
              positions={section.positions}
              currency={currency}
              fxRate={fxRate}
              sectionPrefix={section.id}
              onUpdateNav={
                section.id === 'unit_trusts' ? (p) => setNavAsset(p.asset) : undefined
              }
            />
          </CollapsibleCard>
        ))}

      {!positionsLoading && custodyPositions.length > 0 && (
        <CollapsibleCard
          title={
            <>
              Held for Others ({custodyPositions.length})
              <HelpTooltip content="Positions you're holding on behalf of other people — these are excluded from your personal net worth and P&L" />
            </>
          }
          icon={<Users className="h-4 w-4 text-purple-500" />}
          accentColor="border-l-purple-500"
          isExpanded={isExpanded('custody')}
          onToggle={() => toggle('custody')}
          headerRight={
            <div className="flex items-center gap-3">
              {!isExpanded('custody') && (
                <span className="text-xs text-muted-foreground">
                  {custodyPositions.length} position{custodyPositions.length !== 1 ? 's' : ''}
                </span>
              )}
              <span className="text-sm font-semibold text-muted-foreground">
                {formatCurrency(convertValue(custodyTotal), currency, 0)}
              </span>
            </div>
          }
        >
          <PositionTable
            positions={custodyPositions}
            currency={currency}
            fxRate={fxRate}
            sectionPrefix="custody"
          />
        </CollapsibleCard>
      )}

      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Position</DialogTitle>
          </DialogHeader>
          <PositionForm
            onSuccess={() => setShowAddForm(false)}
            cryptoCount={sections.find((s) => s.id === 'crypto')?.positions.length ?? 0}
            stablesCount={sections.find((s) => s.id === 'stables')?.positions.length ?? 0}
            existingCustodyNames={existingCustodyNames}
          />
        </DialogContent>
      </Dialog>

      <UpdateNavModal
        asset={navAsset}
        open={!!navAsset}
        onClose={() => setNavAsset(null)}
      />

      <Dialog open={editingPerp} onOpenChange={setEditingPerp}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Perp Exposure</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter your total open perp position size in USD. This will be added to your crypto
              exposure.
            </p>
            <div className="space-y-1">
              <label className="text-sm">Position Size (USD)</label>
              <Input
                type="number"
                value={perpInput}
                onChange={(e) => setPerpInput(e.target.value)}
                onKeyDown={handlePerpKeyDown}
                placeholder="0"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingPerp(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handlePerpSave}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteAllConfirm} onOpenChange={setShowDeleteAllConfirm}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete All Positions</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete all{' '}
              <span className="font-semibold text-foreground">{positions?.length || 0}</span>{' '}
              positions? This will permanently remove all your portfolio data.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteAllConfirm(false)}
                disabled={deleteAllMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  deleteAllMutation.mutate(undefined, {
                    onSuccess: () => {
                      setShowDeleteAllConfirm(false);
                    },
                  });
                }}
                disabled={deleteAllMutation.isPending}
              >
                {deleteAllMutation.isPending ? 'Deleting...' : 'Delete All'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

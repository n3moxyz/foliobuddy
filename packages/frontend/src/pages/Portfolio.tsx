import { useState, useMemo } from 'react';
import { usePositions, usePortfolioSummary, useDeleteAllPositions } from '@/hooks/usePortfolio';
import { useCurrencyStore } from '@/stores/currencyStore';
import { USD_SGD_FALLBACK_RATE } from '@foliobuddy/shared';
import {
  formatCurrency,
  formatPercent,
  getPnLColorClass,
  isMarketExposureCategory,
  isStablecoinCategory,
} from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PositionTable } from '@/components/portfolio/PositionTable';
import { copyPositionsToClipboard } from '@/components/portfolio/positionClipboard';
import { CollapsibleCard } from '@/components/portfolio/CollapsibleCard';
import { PositionForm } from '@/components/portfolio/PositionForm';
import { UpdateNavModal } from '@/components/portfolio/UpdateNavModal';
import { PageActionHeader } from '@/components/layout/PageActionHeader';
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
import { FormattedNumberInput } from '@/components/ui/formatted-number-input';
import { useCollapsibleState } from '@/hooks/useCollapsibleState';
import type { Position } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpTooltip } from '@/components/ui/HelpTooltip';

const PERP_EXPOSURE_KEY = 'foliobuddy-perp-exposure';
const LEGACY_PERP_EXPOSURE_KEY = 'pa-portfolio-perp-exposure';
const PERP_EXPOSURE_INPUT_ID = 'perp-exposure-input';
const PORTFOLIO_SUMMARY_SKELETON_KEYS = ['total', 'exposure', 'positions', 'pnl', 'cash'] as const;
const PORTFOLIO_SECTION_SKELETON_KEYS = ['primary', 'secondary'] as const;
const PORTFOLIO_ROW_SKELETON_KEYS = ['first', 'second', 'third'] as const;

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
    accentColor: 'border-blue-500/40 bg-blue-500/5',
  },
  {
    id: 'equities',
    label: 'Equities',
    filter: (p) => p.asset.category === 'EQUITY' || p.asset.category === 'UNIT_TRUST',
    icon: <LineChart className="h-4 w-4 text-amber-500" />,
    accentColor: 'border-amber-500/40 bg-amber-500/5',
  },
  {
    id: 'cash',
    label: 'Cash',
    filter: (p) => isStablecoinCategory(p.asset.category),
    icon: <Banknote className="h-4 w-4 text-green-500" />,
    accentColor: 'border-green-500/40 bg-green-500/5',
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

  const fxRate = useMemo(() => {
    if (summary && summary.totalValueUsd > 0 && summary.totalValueSgd > 0) {
      return summary.totalValueSgd / summary.totalValueUsd;
    }
    return USD_SGD_FALLBACK_RATE;
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

  const { ownedPositions, custodyPositions } = useMemo(() => {
    if (!positions) return { ownedPositions: [] as Position[], custodyPositions: [] as Position[] };
    return {
      ownedPositions: positions.filter((p) => !p.custodyOf),
      custodyPositions: positions.filter((p) => !!p.custodyOf),
    };
  }, [positions]);

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
    const names = new Set<string>();
    for (const position of custodyPositions) {
      if (position.custodyOf) {
        names.add(position.custodyOf);
      }
    }
    return Array.from(names).sort();
  }, [custodyPositions]);

  // Derived total for exposure calc in summary cards
  const marketExposureTotal = useMemo(() => {
    return ownedPositions
      .filter((position) => isMarketExposureCategory(position.asset.category))
      .reduce((sum, position) => sum + (position.marketValueUsd ?? 0), 0);
  }, [ownedPositions]);

  return (
    <div className="space-y-6">
      <PageActionHeader
        title="Portfolio"
        subtitle={`${positions?.length ?? 0} positions`}
        actions={
          <>
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
                <Check className="h-4 w-4 mr-1 text-profit" />
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
          </>
        }
      />

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
                <HelpTooltip content="Your total cost basis: how much you invested" />
              </div>
              <p className="font-medium tabular-nums">
                {formatCurrency(convertValue(summary.totalCostBasis), currency, 0)}
              </p>
            </div>
            <div className="px-4">
              <div className="flex items-center gap-1">
                <p className="text-muted-foreground text-sm">Exposure</p>
                <HelpTooltip content="Percentage of portfolio in market-risk assets, excluding stablecoins and cash" />
              </div>
              <p className="font-medium tabular-nums">
                {summary.totalValueUsd > 0
                  ? `${(((marketExposureTotal + perpExposure) / summary.totalValueUsd) * 100).toFixed(1)}%`
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
                <HelpTooltip content="Your total cost basis: how much you invested" />
              </div>
              <p className="font-medium tabular-nums">
                {formatCurrency(convertValue(summary.totalCostBasis), currency, 0)}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1">
                <p className="text-muted-foreground text-sm">Exposure</p>
                <HelpTooltip content="Percentage of portfolio in market-risk assets, excluding stablecoins and cash" />
              </div>
              <p className="font-medium tabular-nums">
                {summary.totalValueUsd > 0
                  ? `${(((marketExposureTotal + perpExposure) / summary.totalValueUsd) * 100).toFixed(1)}%`
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
            {PORTFOLIO_SUMMARY_SKELETON_KEYS.map((key) => (
              <div key={key} className="py-3 px-4">
                <Skeleton className="h-3 w-16 mb-2" />
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </div>
          {PORTFOLIO_SECTION_SKELETON_KEYS.map((sectionKey) => (
            <div key={sectionKey} className="rounded-md border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-24" />
                <div className="ml-auto">
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
              <div className="space-y-2">
                {PORTFOLIO_ROW_SKELETON_KEYS.map((rowKey) => (
                  <Skeleton key={`${sectionKey}-${rowKey}`} className="h-10 w-full" />
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
            Add your first crypto or cash position to start tracking your portfolio value and P&L.
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
                {section.id === 'cash' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 shrink-0 text-xs text-muted-foreground hover:text-foreground sm:h-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePerpEdit();
                    }}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    {perpExposure > 0 ? 'Edit Perp' : 'Add Perp'}
                  </Button>
                )}
                <span className="text-sm font-semibold text-muted-foreground">
                  {formatCurrency(convertValue(section.total), currency, 0)}
                </span>
              </div>
            }
            headerExtra={
              section.id === 'cash' && perpExposure > 0 ? (
                <div className="flex items-center justify-end gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">
                    Available:{' '}
                    {formatCurrency(convertValue(section.total - perpExposure), currency, 0)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Perp:
                    <HelpTooltip content="Open perpetual futures position size: adds to your crypto exposure calculation" />{' '}
                    {formatCurrency(convertValue(perpExposure), currency, 0)}
                  </span>
                </div>
              ) : undefined
            }
          >
            <PositionTable
              positions={section.positions}
              currency={currency}
              fxRate={fxRate}
              sectionPrefix={section.id}
              groupBy={section.id === 'equities' ? 'equityType' : 'storage'}
              onUpdateNav={section.id === 'equities' ? (p) => setNavAsset(p.asset) : undefined}
            />
          </CollapsibleCard>
        ))}

      {!positionsLoading && custodyPositions.length > 0 && (
        <CollapsibleCard
          title={`Held for Others (${custodyPositions.length})`}
          titleHelp={
            <HelpTooltip content="Positions you're holding on behalf of other people. These are excluded from your personal net worth and P&L" />
          }
          icon={<Users className="h-4 w-4 text-purple-500" />}
          accentColor="border-purple-500/40 bg-purple-500/5"
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
            <DialogDescription className="sr-only">
              Create a portfolio position manually or import positions from JSON.
            </DialogDescription>
          </DialogHeader>
          <PositionForm
            onSuccess={() => setShowAddForm(false)}
            cryptoCount={sections.find((s) => s.id === 'crypto')?.positions.length ?? 0}
            cashCount={sections.find((s) => s.id === 'cash')?.positions.length ?? 0}
            existingCustodyNames={existingCustodyNames}
          />
        </DialogContent>
      </Dialog>

      <UpdateNavModal asset={navAsset} open={!!navAsset} onClose={() => setNavAsset(null)} />

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
              <label htmlFor={PERP_EXPOSURE_INPUT_ID} className="text-sm">
                Position Size (USD)
              </label>
              <FormattedNumberInput
                id={PERP_EXPOSURE_INPUT_ID}
                value={perpInput}
                onValueChange={setPerpInput}
                onKeyDown={handlePerpKeyDown}
                placeholder="0"
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

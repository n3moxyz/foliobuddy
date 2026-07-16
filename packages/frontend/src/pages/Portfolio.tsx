import { useState, useMemo } from 'react';
import {
  usePositions,
  usePortfolioSummary,
  useDeleteAllPositions,
  useFxRates,
} from '@/hooks/usePortfolio';
import { useCurrencyStore } from '@/stores/currencyStore';
import { USD_SGD_FALLBACK_RATE } from '@foliobuddy/shared';
import {
  formatCurrency,
  formatPercent,
  getPnLColorClass,
  isMarketExposureCategory,
  isStablecoinCategory,
  cn,
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
import { calculatePositionGroupPnL } from '@/components/portfolio/positionGroupMath';

const PERP_EXPOSURE_KEY = 'foliobuddy-perp-exposure';
const LEGACY_PERP_EXPOSURE_KEY = 'pa-portfolio-perp-exposure';
const PERP_EXPOSURE_INPUT_ID = 'perp-exposure-input';
const PERP_EXPOSURE_INLINE_INPUT_ID = 'perp-exposure-inline-input';
const PORTFOLIO_SUMMARY_SKELETON_KEYS = ['total', 'exposure', 'positions', 'pnl', 'cash'] as const;
const PORTFOLIO_SECTION_SKELETON_KEYS = ['primary', 'secondary'] as const;
const PORTFOLIO_ROW_SKELETON_KEYS = ['first', 'second', 'third'] as const;
const EQUITY_GROUP_BY_KEY = 'foliobuddy-equity-group-by';
type EquityGroupBy = 'broker' | 'equityType';

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
    icon: <Coins className="h-4 w-4 text-crypto" />,
    accentColor: 'border-crypto/40 bg-crypto/5',
  },
  {
    id: 'equities',
    label: 'Equities',
    filter: (p) => p.asset.category === 'EQUITY' || p.asset.category === 'UNIT_TRUST',
    icon: <LineChart className="h-4 w-4 text-equities" />,
    accentColor: 'border-equities/40 bg-equities/5',
  },
  {
    id: 'cash',
    label: 'Cash',
    filter: (p) => isStablecoinCategory(p.asset.category),
    icon: <Banknote className="h-4 w-4 text-cash" />,
    accentColor: 'border-cash/40 bg-cash/5',
  },
];

// Custody ("Held for Others") accent — single source of truth, mirrored across
// the mobile heading and the desktop CollapsibleCard render paths.
const CUSTODY_CONFIG = {
  iconClass: 'h-4 w-4 shrink-0 text-custody',
  accentColor: 'border-custody/40 bg-custody/5',
};

function loadEquityGroupBy(): EquityGroupBy {
  try {
    return localStorage.getItem(EQUITY_GROUP_BY_KEY) === 'equityType' ? 'equityType' : 'broker';
  } catch {
    return 'broker';
  }
}

function saveEquityGroupBy(value: EquityGroupBy) {
  try {
    localStorage.setItem(EQUITY_GROUP_BY_KEY, value);
  } catch {
    // localStorage may be unavailable in privacy-restricted browser contexts.
  }
}

export default function Portfolio() {
  const { currency } = useCurrencyStore();
  const { data: positions, isLoading: positionsLoading } = usePositions();
  const { data: summary } = usePortfolioSummary();
  const { data: fxRates } = useFxRates();
  const deleteAllMutation = useDeleteAllPositions();
  const [showAddForm, setShowAddForm] = useState(false);
  const [navAsset, setNavAsset] = useState<Position['asset'] | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [equityGroupBy, setEquityGroupBy] = useState<EquityGroupBy>(loadEquityGroupBy);

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
  const [editingPerpInline, setEditingPerpInline] = useState(false);
  const [perpInput, setPerpInput] = useState('');

  const fxRate = useMemo(() => {
    if (summary && summary.totalValueUsd > 0 && summary.totalValueSgd > 0) {
      return summary.totalValueSgd / summary.totalValueUsd;
    }
    return USD_SGD_FALLBACK_RATE;
  }, [summary]);

  const usdFxRates = useMemo(() => {
    const rates: Record<string, number> = { USD: 1, SGD: fxRate };

    for (const rate of fxRates ?? []) {
      const from = rate.fromCcy.toUpperCase();
      const to = rate.toCcy.toUpperCase();
      if (from === 'USD' && rate.rate > 0) {
        rates[to] = rate.rate;
      } else if (to === 'USD' && rate.rate > 0) {
        rates[from] = 1 / rate.rate;
      }
    }

    return rates;
  }, [fxRates, fxRate]);

  // Helper to convert values based on currency
  const convertValue = (usdValue: number | null | undefined) => {
    if (usdValue === null || usdValue === undefined) return usdValue;
    return currency === 'SGD' ? usdValue * fxRate : usdValue;
  };

  const handlePerpDialogOpen = () => {
    setPerpInput(perpExposure.toString());
    setEditingPerp(true);
  };

  const persistPerpExposure = (value: number) => {
    setPerpExposure(value);
    if (value > 0) {
      localStorage.setItem(PERP_EXPOSURE_KEY, value.toString());
    } else {
      localStorage.removeItem(PERP_EXPOSURE_KEY);
    }
  };

  const handlePerpSave = () => {
    const value = parseFloat(perpInput) || 0;
    persistPerpExposure(value);
    setEditingPerp(false);
  };

  const handlePerpKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePerpSave();
    } else if (e.key === 'Escape') {
      setEditingPerp(false);
    }
  };

  const handlePerpInlineEdit = () => {
    setPerpInput((convertValue(perpExposure) ?? perpExposure).toString());
    setEditingPerpInline(true);
  };

  const handlePerpInlineSave = () => {
    if (!perpInput.trim()) {
      setEditingPerpInline(false);
      return;
    }

    const displayValue = parseFloat(perpInput) || 0;
    persistPerpExposure(currency === 'SGD' ? displayValue / fxRate : displayValue);
    setEditingPerpInline(false);
  };

  const handlePerpInlineKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handlePerpInlineSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setPerpInput((convertValue(perpExposure) ?? perpExposure).toString());
      setEditingPerpInline(false);
    }
  };

  const handlePerpDelete = () => {
    persistPerpExposure(0);
    setPerpInput('');
    setEditingPerpInline(false);
  };

  const handleEquityGroupByChange = (value: EquityGroupBy) => {
    setEquityGroupBy(value);
    saveEquityGroupBy(value);
  };

  const renderEquityGroupToggle = (className?: string) => (
    <div
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center rounded-md border bg-background p-0.5 sm:min-h-9',
        className
      )}
      role="group"
      aria-label="Equities grouping"
    >
      {[
        { value: 'broker' as const, label: 'By Broker' },
        { value: 'equityType' as const, label: 'By Type' },
      ].map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={equityGroupBy === option.value}
          onClick={(event) => {
            event.stopPropagation();
            handleEquityGroupByChange(option.value);
          }}
          className={cn(
            'min-h-10 rounded-sm px-3 text-xs font-medium transition-colors touch-manipulation sm:min-h-8',
            equityGroupBy === option.value
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

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
      const groupPnL = calculatePositionGroupPnL(filtered);

      return {
        ...config,
        positions: filtered,
        total: filtered.reduce((s, p) => s + (p.marketValueUsd || 0), 0),
        pnlUsd: groupPnL.pnlUsd,
        pnlPct: groupPnL.pnlPct,
      };
    }).filter((s) => s.positions.length > 0);
  }, [ownedPositions]);

  // Custody section totals
  const custodyTotal = useMemo(() => {
    return custodyPositions.reduce((s, p) => s + (p.marketValueUsd || 0), 0);
  }, [custodyPositions]);
  const custodyGroupPnL = useMemo(
    () => calculatePositionGroupPnL(custodyPositions),
    [custodyPositions]
  );

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
  const exposurePct =
    summary && summary.totalValueUsd > 0
      ? `${(((marketExposureTotal + perpExposure) / summary.totalValueUsd) * 100).toFixed(1)}%`
      : '0%';

  return (
    <div className="space-y-6">
      <PageActionHeader
        title="Portfolio"
        subtitle={`${positions?.length ?? 0} positions`}
        stickyOnMobile={false}
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
            <Button
              size="sm"
              className="hidden touch-manipulation sm:inline-flex"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Position
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden touch-manipulation sm:inline-flex"
                  aria-label="More options"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="touch-manipulation sm:hidden"
                  aria-label="More actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="min-h-11"
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
                <DropdownMenuItem className="min-h-11" onClick={handlePerpDialogOpen}>
                  <Pencil className="h-4 w-4 mr-2" />
                  {perpExposure > 0 ? 'Edit Perp' : 'Add Perp'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11"
                  onClick={() => window.open(api.exportPositionsCsv(), '_blank')}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11"
                  onClick={() => window.open(api.exportExcel(), '_blank')}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export Excel
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-11 text-destructive"
                  onClick={() => setShowDeleteAllConfirm(true)}
                  disabled={!positions || positions.length === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete All
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      >
        {summary && (
          <div className="pb-1">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border/80 bg-card/50 p-3 shadow-sm sm:hidden">
              <div className="min-w-0">
                <p className="text-xs leading-none text-muted-foreground">Total Value</p>
                <p className="mt-1 truncate font-mono text-base font-semibold tabular-nums">
                  {formatCurrency(convertValue(summary.totalValueUsd), currency, 0)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-xs leading-none text-muted-foreground">YTD P&L</p>
                <p
                  className={`mt-1 truncate font-mono text-base font-semibold tabular-nums ${getPnLColorClass(summary.unrealizedPnL)}`}
                >
                  {formatCurrency(convertValue(summary.unrealizedPnL), currency, 0)}
                </p>
                <p
                  className={`font-mono text-[11px] leading-none tabular-nums ${getPnLColorClass(summary.unrealizedPnL)}`}
                >
                  {formatPercent(summary.unrealizedPnLPct)}
                </p>
              </div>
              <Button size="sm" className="shrink-0 px-3" onClick={() => setShowAddForm(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>

            <div className="hidden sm:block">
              <div className="flex items-baseline gap-3 flex-wrap">
                <p className="text-[2rem] font-bold leading-none tracking-tight tabular-nums sm:text-4xl">
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

              <div className="mt-4 grid grid-cols-4 divide-x divide-border">
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
                  <p className="font-medium tabular-nums">{exposurePct}</p>
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
                  <p
                    className={`font-medium tabular-nums ${getPnLColorClass(summary.unrealizedPnL)}`}
                  >
                    {formatCurrency(convertValue(summary.unrealizedPnL), currency, 0)}{' '}
                    <span className="text-xs">({formatPercent(summary.unrealizedPnLPct)})</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </PageActionHeader>

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
          <h2 className="text-lg font-semibold mb-1">No positions yet</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
            Add your first crypto or cash position to start tracking your portfolio value and P&L.
          </p>
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Position
          </Button>
        </div>
      )}

      {!positionsLoading && ownedPositions.length > 0 && (
        <div className="sm:hidden">
          <PositionTable
            positions={ownedPositions}
            currency={currency}
            fxRate={fxRate}
            usdFxRates={usdFxRates}
            sectionPrefix="mobile-owned"
            groupBy="broker"
            mobileVariant="compact"
            showMobileColumnToggle={false}
            onUpdateNav={(p) => setNavAsset(p.asset)}
          />
        </div>
      )}

      {!positionsLoading && custodyPositions.length > 0 && (
        <div className="mt-6 sm:hidden">
          <div className="mb-2 flex items-center gap-2 px-1">
            <Users className={CUSTODY_CONFIG.iconClass} />
            <span className="text-sm font-semibold">Held for Others</span>
            <HelpTooltip content="Positions you're holding on behalf of other people. Excluded from your net worth and P&L" />
            <span className="ml-auto flex shrink-0 flex-col items-end gap-0.5 font-mono text-xs leading-tight tabular-nums">
              {custodyGroupPnL.pnlUsd !== null && (
                <span className={getPnLColorClass(custodyGroupPnL.pnlUsd)}>
                  {formatCurrency(convertValue(custodyGroupPnL.pnlUsd), currency, 0)} (
                  {formatPercent(custodyGroupPnL.pnlPct)})
                </span>
              )}
              <span className="text-sm font-semibold text-muted-foreground">
                {formatCurrency(convertValue(custodyTotal), currency, 0)}
              </span>
            </span>
          </div>
          <PositionTable
            positions={custodyPositions}
            currency={currency}
            fxRate={fxRate}
            usdFxRates={usdFxRates}
            sectionPrefix="mobile-custody"
            mobileVariant="compact"
            showMobileColumnToggle={false}
          />
        </div>
      )}

      <div className="hidden space-y-6 sm:block">
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
                <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
                  {!isExpanded(section.id) && (
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {section.positions.length} position
                      {section.positions.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {section.id === 'cash' && perpExposure <= 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 shrink-0 text-xs text-muted-foreground hover:text-foreground sm:h-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePerpDialogOpen();
                      }}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Add Perp
                    </Button>
                  )}
                  {section.id === 'equities' && renderEquityGroupToggle('hidden sm:inline-flex')}
                  {section.pnlUsd !== null && (
                    <span
                      className={`shrink-0 font-mono text-sm font-medium tabular-nums ${getPnLColorClass(section.pnlUsd)}`}
                      aria-label={`Unrealized P and L ${formatCurrency(
                        convertValue(section.pnlUsd),
                        currency,
                        0
                      )} (${formatPercent(section.pnlPct)})`}
                    >
                      {formatCurrency(convertValue(section.pnlUsd), currency, 0)} (
                      {formatPercent(section.pnlPct)})
                    </span>
                  )}
                  <span className="shrink-0 text-sm font-semibold text-muted-foreground">
                    {formatCurrency(convertValue(section.total), currency, 0)}
                  </span>
                </div>
              }
              headerExtra={
                <>
                  {section.id === 'equities' && (
                    <div className="mt-2 flex justify-end sm:hidden">
                      {renderEquityGroupToggle()}
                    </div>
                  )}
                  {section.id === 'cash' && perpExposure > 0 && (
                    <div className="mt-1 flex items-center justify-end gap-2">
                      <span className="text-xs text-muted-foreground">
                        Available:{' '}
                        {formatCurrency(convertValue(section.total - perpExposure), currency, 0)}
                      </span>
                      <div className="flex min-h-10 items-center gap-1 text-xs text-muted-foreground">
                        <span>Perp:</span>
                        <HelpTooltip content="Open perpetual futures position size: adds to your crypto exposure calculation" />{' '}
                        {editingPerpInline ? (
                          <FormattedNumberInput
                            id={PERP_EXPOSURE_INLINE_INPUT_ID}
                            value={perpInput}
                            onValueChange={setPerpInput}
                            onBlur={handlePerpInlineSave}
                            onKeyDown={handlePerpInlineKeyDown}
                            className="h-8 w-28 px-2 text-right font-mono text-xs tabular-nums"
                            aria-label={`Perp exposure in ${currency}`}
                            autoFocus
                          />
                        ) : (
                          <button
                            type="button"
                            className="rounded-sm font-mono tabular-nums transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            onDoubleClick={handlePerpInlineEdit}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === 'F2') {
                                event.preventDefault();
                                handlePerpInlineEdit();
                              }
                            }}
                            aria-label={`Perp exposure ${formatCurrency(
                              convertValue(perpExposure),
                              currency,
                              0
                            )}. Double-click or press Enter to edit.`}
                            title="Double-click to edit"
                          >
                            {formatCurrency(convertValue(perpExposure), currency, 0)}
                          </button>
                        )}
                        {!editingPerpInline && (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={handlePerpInlineEdit}
                              aria-label="Edit perp exposure"
                              title="Edit perp exposure"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={handlePerpDelete}
                              aria-label="Delete perp exposure"
                              title="Delete perp exposure"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </>
              }
            >
              <PositionTable
                positions={section.positions}
                currency={currency}
                fxRate={fxRate}
                usdFxRates={usdFxRates}
                sectionPrefix={section.id}
                groupBy={section.id === 'equities' ? equityGroupBy : 'storage'}
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
            icon={<Users className={CUSTODY_CONFIG.iconClass} />}
            accentColor={CUSTODY_CONFIG.accentColor}
            isExpanded={isExpanded('custody')}
            onToggle={() => toggle('custody')}
            headerRight={
              <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
                {!isExpanded('custody') && (
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {custodyPositions.length} position{custodyPositions.length !== 1 ? 's' : ''}
                  </span>
                )}
                {custodyGroupPnL.pnlUsd !== null && (
                  <span
                    className={`shrink-0 font-mono text-sm font-medium tabular-nums ${getPnLColorClass(custodyGroupPnL.pnlUsd)}`}
                    aria-label={`Unrealized P and L ${formatCurrency(
                      convertValue(custodyGroupPnL.pnlUsd),
                      currency,
                      0
                    )} (${formatPercent(custodyGroupPnL.pnlPct)})`}
                  >
                    {formatCurrency(convertValue(custodyGroupPnL.pnlUsd), currency, 0)} (
                    {formatPercent(custodyGroupPnL.pnlPct)})
                  </span>
                )}
                <span className="shrink-0 text-sm font-semibold text-muted-foreground">
                  {formatCurrency(convertValue(custodyTotal), currency, 0)}
                </span>
              </div>
            }
          >
            <PositionTable
              positions={custodyPositions}
              currency={currency}
              fxRate={fxRate}
              usdFxRates={usdFxRates}
              sectionPrefix="custody"
            />
          </CollapsibleCard>
        )}
      </div>

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
            <DialogDescription className="sr-only">
              Edit the total open perpetual futures exposure used in portfolio exposure metrics.
            </DialogDescription>
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

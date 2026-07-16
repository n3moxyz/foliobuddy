import { useState, useMemo, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  formatCurrency,
  formatPercent,
  formatDateTime,
  formatQuantity,
  getPnLColorClass,
  cn,
} from '@/lib/utils';
import {
  useCancelPositionHistory,
  useDeletePosition,
  usePositionHistory,
} from '@/hooks/usePortfolio';
import { PositionForm } from './PositionForm';
import { PositionRow } from './PositionRow';
import {
  Copy,
  Check,
  ChevronRight,
  Pencil,
  Trash2,
  Columns3,
  Columns2,
  History,
  MoreVertical,
  RefreshCw,
} from 'lucide-react';
import { useCollapsibleState } from '@/hooks/useCollapsibleState';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableHeader } from '@/components/ui/SortableHeader';
import type { ColumnConfig, SortDirection } from '@/hooks/useTableSort';
import type { Position, PositionHistoryEntry } from '@/lib/types';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { copyPositionsToClipboard } from '@/components/portfolio/positionClipboard';
import {
  localAmountLabel,
  localPriceLabel,
  type UsdFxRatesByCurrency,
} from '@/components/portfolio/positionPriceDisplay';
import { calculatePositionGroupPnL } from '@/components/portfolio/positionGroupMath';

const SKIP_DELETE_CONFIRM_KEY = 'foliobuddy-skip-delete-confirm';
const LEGACY_SKIP_DELETE_KEY = 'pa-portfolio-skip-delete-confirm';
type PositionGroupBy = 'storage' | 'equityType' | 'broker';
type MobilePositionVariant = 'focus' | 'compact';

interface BrokerGroupMeta {
  id: string;
  key: string;
  label: string;
  count: number;
  total: number;
}

interface BrokerGroup extends BrokerGroupMeta {
  positions: Position[];
}

interface PositionTableProps {
  positions: Position[];
  currency?: 'USD' | 'SGD';
  fxRate?: number;
  usdFxRates?: UsdFxRatesByCurrency;
  sectionPrefix?: string;
  onUpdateNav?: (position: Position) => void;
  /**
   * How to sub-group rows inside the card:
   * - 'storage' (default): CEX / Broker account / Bank / Onchain — used for crypto/cash/custody
   * - 'equityType': Single / Fund-level (by asset.category) — used for Equities
   * - 'broker': individual broker/fund platform names — used for Equities
   */
  groupBy?: PositionGroupBy;
  mobileVariant?: MobilePositionVariant;
  showMobileColumnToggle?: boolean;
}

const STORAGE_TYPE_LABELS: Record<string, string> = {
  WALLET: 'Onchain',
  CEX: 'CEX',
  DEFI: 'DeFi',
  BANK: 'Bank',
  BROKERAGE: 'Broker account',
};

const POSITION_COLUMNS: Record<string, ColumnConfig<Position>> = {
  asset: { accessor: (p) => p.asset.symbol, type: 'string' },
  quantity: { accessor: (p) => p.quantity, type: 'number' },
  avgCost: { accessor: (p) => p.avgCostUsd, type: 'number' },
  totalCost: { accessor: (p) => p.quantity * p.avgCostUsd, type: 'number' },
  price: { accessor: (p) => p.asset.currentPriceUsd, type: 'number' },
  value: { accessor: (p) => p.marketValueUsd, type: 'number' },
  pnl: { accessor: (p) => p.unrealizedPnL, type: 'number' },
  storage: { accessor: (p) => `${p.storageType}-${p.storageLocation || ''}`, type: 'string' },
};

function sortPositionsByMarketValue(a: Position, b: Position) {
  return (b.marketValueUsd ?? 0) - (a.marketValueUsd ?? 0);
}

function brokerLabelForPosition(position: Position): string {
  const location = position.storageLocation?.trim();
  if (location) return location;
  if (position.storageType === 'BROKERAGE') return 'Broker account';
  return STORAGE_TYPE_LABELS[position.storageType] || position.storageType || 'Storage';
}

function brokerKeyForPosition(position: Position): string {
  return brokerLabelForPosition(position).toLocaleLowerCase();
}

function slugifySectionLabel(label: string) {
  return (
    label
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'storage'
  );
}

export function PositionTable({
  positions,
  currency = 'USD',
  fxRate = 1,
  usdFxRates,
  sectionPrefix,
  onUpdateNav,
  groupBy = 'storage',
  mobileVariant = 'focus',
  showMobileColumnToggle = true,
}: PositionTableProps) {
  const [viewPosition, setViewPosition] = useState<Position | null>(null);
  const [editPosition, setEditPosition] = useState<Position | null>(null);
  const [deletePosition, setDeletePosition] = useState<Position | null>(null);
  const [cancelHistoryEntry, setCancelHistoryEntry] = useState<PositionHistoryEntry | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState(() => {
    // Migrates users from the old pa-portfolio key to the new foliobuddy key on first render
    const legacy = localStorage.getItem(LEGACY_SKIP_DELETE_KEY);
    if (legacy !== null) {
      localStorage.setItem(SKIP_DELETE_CONFIRM_KEY, legacy);
      localStorage.removeItem(LEGACY_SKIP_DELETE_KEY);
      return legacy === 'true';
    }
    return localStorage.getItem(SKIP_DELETE_CONFIRM_KEY) === 'true';
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAllColumns, setShowAllColumns] = useState(false);
  // SGD last so it wins over any DB USD->SGD rate in usdFxRates: the native SGD label
  // then uses the same portfolio-summary rate as the primary column (avoids bps drift).
  const priceFxRates = useMemo(
    () => ({ USD: 1, ...(usdFxRates ?? {}), SGD: fxRate }),
    [fxRate, usdFxRates]
  );
  const deletePositionMutation = useDeletePosition();
  const cancelPositionHistoryMutation = useCancelPositionHistory();
  const {
    data: positionHistory = [],
    isLoading: isHistoryLoading,
    isError: isHistoryError,
  } = usePositionHistory(viewPosition?.id);

  const handleCopy = useCallback(async (position: Position, e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await copyPositionsToClipboard(position);
    if (success) {
      setCopiedId(position.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, []);

  const convert = useCallback(
    (usdValue: number | null | undefined) => {
      if (usdValue === null || usdValue === undefined) return usdValue;
      return currency === 'SGD' ? usdValue * fxRate : usdValue;
    },
    [currency, fxRate]
  );

  const getSmartDecimals = useCallback((value: number | null | undefined): number => {
    if (value === null || value === undefined) return 2;
    const absValue = Math.abs(value);
    return absValue < 1000 ? 2 : 0;
  }, []);

  const { isExpanded, toggle } = useCollapsibleState();

  const {
    defaultCex,
    defaultBrokerage,
    defaultBank,
    defaultOnchain,
    cexTotal,
    brokerageTotal,
    bankTotal,
    onchainTotal,
  } = useMemo(() => {
    const cex: Position[] = [];
    const brokerage: Position[] = [];
    const bank: Position[] = [];
    const onchain: Position[] = [];

    positions.forEach((pos) => {
      if (pos.storageType === 'CEX') {
        cex.push(pos);
      } else if (pos.storageType === 'BROKERAGE') {
        brokerage.push(pos);
      } else if (pos.storageType === 'BANK') {
        bank.push(pos);
      } else {
        onchain.push(pos);
      }
    });

    cex.sort(sortPositionsByMarketValue);
    brokerage.sort(sortPositionsByMarketValue);
    bank.sort(sortPositionsByMarketValue);

    // Ledger positions sort to the top; ties break by market value
    onchain.sort((a, b) => {
      const aIsLedger = a.storageLocation?.toLowerCase().includes('ledger') ? 1 : 0;
      const bIsLedger = b.storageLocation?.toLowerCase().includes('ledger') ? 1 : 0;
      if (aIsLedger !== bIsLedger) return bIsLedger - aIsLedger;
      return sortPositionsByMarketValue(a, b);
    });

    return {
      defaultCex: cex,
      defaultBrokerage: brokerage,
      defaultBank: bank,
      defaultOnchain: onchain,
      cexTotal: cex.reduce((s, p) => s + (p.marketValueUsd || 0), 0),
      brokerageTotal: brokerage.reduce((s, p) => s + (p.marketValueUsd || 0), 0),
      bankTotal: bank.reduce((s, p) => s + (p.marketValueUsd || 0), 0),
      onchainTotal: onchain.reduce((s, p) => s + (p.marketValueUsd || 0), 0),
    };
  }, [positions]);

  const cexSort = useTableSort(defaultCex, POSITION_COLUMNS);
  const brokerageSort = useTableSort(defaultBrokerage, POSITION_COLUMNS);
  const bankSort = useTableSort(defaultBank, POSITION_COLUMNS);
  const onchainSort = useTableSort(defaultOnchain, POSITION_COLUMNS);
  const cexPositions = cexSort.sortedItems;
  const brokeragePositions = brokerageSort.sortedItems;
  const bankPositions = bankSort.sortedItems;
  const onchainPositions = onchainSort.sortedItems;

  // Split Equities into Single (stocks) vs Fund-level (unit trusts) when groupBy === 'equityType'
  const { defaultSingle, defaultFund, singleTotal, fundTotal } = useMemo(() => {
    const single: Position[] = [];
    const fund: Position[] = [];
    positions.forEach((pos) => {
      if (pos.asset.category === 'UNIT_TRUST') fund.push(pos);
      else single.push(pos);
    });
    single.sort(sortPositionsByMarketValue);
    fund.sort(sortPositionsByMarketValue);
    return {
      defaultSingle: single,
      defaultFund: fund,
      singleTotal: single.reduce((s, p) => s + (p.marketValueUsd || 0), 0),
      fundTotal: fund.reduce((s, p) => s + (p.marketValueUsd || 0), 0),
    };
  }, [positions]);

  const singleSort = useTableSort(defaultSingle, POSITION_COLUMNS);
  const fundSort = useTableSort(defaultFund, POSITION_COLUMNS);
  const singlePositions = singleSort.sortedItems;
  const fundPositions = fundSort.sortedItems;

  const { defaultBrokerPositions, brokerGroupMeta } = useMemo(() => {
    const groupsByKey = new Map<
      string,
      { key: string; label: string; positions: Position[]; total: number }
    >();

    positions.forEach((position) => {
      const key = brokerKeyForPosition(position);
      const existingGroup = groupsByKey.get(key);
      if (existingGroup) {
        existingGroup.positions.push(position);
        existingGroup.total += position.marketValueUsd || 0;
        return;
      }

      groupsByKey.set(key, {
        key,
        label: brokerLabelForPosition(position),
        positions: [position],
        total: position.marketValueUsd || 0,
      });
    });

    const groups = Array.from(groupsByKey.values()).sort((a, b) => {
      const totalComparison = b.total - a.total;
      if (totalComparison !== 0) return totalComparison;
      return a.label.localeCompare(b.label);
    });

    groups.forEach((group) => group.positions.sort(sortPositionsByMarketValue));

    return {
      defaultBrokerPositions: groups.flatMap((group) => group.positions),
      brokerGroupMeta: groups.map((group) => ({
        id: `${sectionPrefix ? `${sectionPrefix}-` : ''}broker-${slugifySectionLabel(group.label)}`,
        key: group.key,
        label: group.label,
        count: group.positions.length,
        total: group.total,
      })),
    };
  }, [positions, sectionPrefix]);

  const brokerSort = useTableSort(defaultBrokerPositions, POSITION_COLUMNS);
  const brokerGroups = useMemo(() => {
    const groupsByKey = new Map<string, BrokerGroup>(
      brokerGroupMeta.map((group) => [group.key, { ...group, positions: [] }])
    );

    brokerSort.sortedItems.forEach((position) => {
      groupsByKey.get(brokerKeyForPosition(position))?.positions.push(position);
    });

    return brokerGroupMeta
      .map((group) => groupsByKey.get(group.key))
      .filter((group): group is BrokerGroup => !!group && group.positions.length > 0);
  }, [brokerGroupMeta, brokerSort.sortedItems]);

  const convertSub = (usdValue: number) => {
    return currency === 'SGD' ? usdValue * fxRate : usdValue;
  };

  const cexId = sectionPrefix ? `${sectionPrefix}-cex` : 'cex';
  const brokerageId = sectionPrefix ? `${sectionPrefix}-brokerage` : 'brokerage';
  const bankId = sectionPrefix ? `${sectionPrefix}-bank` : 'bank';
  const onchainId = sectionPrefix ? `${sectionPrefix}-onchain` : 'onchain';
  const singleId = sectionPrefix ? `${sectionPrefix}-single` : 'single';
  const fundId = sectionPrefix ? `${sectionPrefix}-fund` : 'fund';

  const handleDeleteClick = useCallback(
    (position: Position) => {
      if (skipConfirm) {
        deletePositionMutation.mutate(position.id);
      } else {
        setDeletePosition(position);
      }
    },
    [skipConfirm, deletePositionMutation]
  );

  const handleDelete = async () => {
    if (!deletePosition) return;

    if (dontAskAgain) {
      localStorage.setItem(SKIP_DELETE_CONFIRM_KEY, 'true');
      setSkipConfirm(true);
    }

    await deletePositionMutation.mutateAsync(deletePosition.id);
    setDeletePosition(null);
    setDontAskAgain(false);
  };

  const handleCancelHistoryEntry = async () => {
    if (!viewPosition || !cancelHistoryEntry) return;

    try {
      const updatedPosition = await cancelPositionHistoryMutation.mutateAsync({
        id: viewPosition.id,
        historyId: cancelHistoryEntry.id,
      });
      setViewPosition(updatedPosition);
      setCancelHistoryEntry(null);
    } catch {
      // Keep the dialog open so the mutation error can be shown below the preview.
    }
  };

  const handleView = useCallback((position: Position) => setViewPosition(position), []);
  const handleEdit = useCallback((position: Position) => setEditPosition(position), []);

  const renderPositionRow = useCallback(
    (position: Position, options: { showUnitTrustBadge?: boolean } = {}) => {
      return (
        <PositionRow
          key={position.id}
          position={position}
          currency={currency}
          fxRate={fxRate}
          usdFxRates={priceFxRates}
          copiedId={copiedId}
          showAllColumns={showAllColumns}
          onView={handleView}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
          onCopy={handleCopy}
          onUpdateNav={onUpdateNav}
          showUnitTrustBadge={options.showUnitTrustBadge}
        />
      );
    },
    [
      currency,
      fxRate,
      priceFxRates,
      copiedId,
      showAllColumns,
      handleView,
      handleEdit,
      handleDeleteClick,
      handleCopy,
      onUpdateNav,
    ]
  );

  const mobileStorageLabelFor = (position: Position) => {
    if (position.storageType === 'BROKERAGE') {
      return position.storageLocation || 'Broker account';
    }

    const storageType = STORAGE_TYPE_LABELS[position.storageType] || position.storageType;
    return position.storageLocation ? `${storageType} · ${position.storageLocation}` : storageType;
  };

  const renderMobileActionMenu = (position: Position) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 touch-manipulation text-muted-foreground"
          aria-label={`Actions for ${position.asset.symbol}`}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          className="min-h-11"
          onClick={(event) => {
            event.stopPropagation();
            setViewPosition(position);
          }}
        >
          <History className="h-4 w-4 mr-2" />
          Details
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-11"
          onClick={(event) => {
            event.stopPropagation();
            handleCopy(position, event);
          }}
        >
          {copiedId === position.id ? (
            <Check className="h-4 w-4 mr-2 text-profit" />
          ) : (
            <Copy className="h-4 w-4 mr-2" />
          )}
          {copiedId === position.id ? 'Copied' : 'Copy'}
        </DropdownMenuItem>
        {onUpdateNav && position.asset.category === 'UNIT_TRUST' && (
          <DropdownMenuItem
            className="min-h-11"
            onClick={(event) => {
              event.stopPropagation();
              onUpdateNav(position);
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Update NAV
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="min-h-11"
          onClick={(event) => {
            event.stopPropagation();
            setEditPosition(position);
          }}
        >
          <Pencil className="h-4 w-4 mr-2" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-11 text-destructive focus:text-destructive"
          onClick={(event) => {
            event.stopPropagation();
            handleDeleteClick(position);
          }}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderMobilePositionRow = (
    position: Position,
    options: { showUnitTrustBadge?: boolean } = {}
  ) => {
    const priceValue = convert(position.asset.currentPriceUsd);
    const avgCostValue = convert(position.avgCostUsd);
    const marketValue = convert(position.marketValueUsd);
    const pnlValue = convert(position.unrealizedPnL);
    const isUnitTrust = position.asset.category === 'UNIT_TRUST';
    const pnlTextClass = getPnLColorClass(position.unrealizedPnL);
    const pnlPillClass =
      (position.unrealizedPnL ?? 0) >= 0
        ? 'border-profit/25 bg-profit text-profit'
        : 'border-loss/25 bg-loss text-loss';

    if (mobileVariant === 'compact') {
      return (
        <div
          key={position.id}
          role="button"
          tabIndex={0}
          className="group relative cursor-pointer py-2.5 pl-3 pr-12 outline-none transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          aria-label={`View ${position.asset.symbol} position`}
          onClick={() => setViewPosition(position)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setViewPosition(position);
            }
          }}
        >
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
            <div className="min-w-0">
              <div className="flex min-w-0 items-baseline gap-1.5">
                <p className="min-w-0 truncate text-sm font-semibold leading-tight">
                  {position.asset.symbol}
                </p>
                {options.showUnitTrustBadge && isUnitTrust && (
                  <span
                    className="inline-flex h-5 shrink-0 items-center rounded-sm border border-warning/35 bg-warning/15 px-1.5 text-[10px] font-semibold leading-none text-warning"
                    aria-label="Unit Trust"
                  >
                    UT
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs leading-snug text-muted-foreground">
                {position.asset.name}
              </p>
            </div>

            <p className="shrink-0 text-right font-mono text-sm font-semibold leading-tight tabular-nums">
              {formatCurrency(marketValue, currency, 0)}
            </p>

            <div
              className={`min-w-[4.25rem] shrink-0 text-right font-mono text-xs font-medium leading-tight tabular-nums ${pnlTextClass}`}
            >
              <p>{formatCurrency(pnlValue, currency, 0)}</p>
              <p>{formatPercent(position.unrealizedPnLPct)}</p>
            </div>
          </div>

          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            {renderMobileActionMenu(position)}
          </div>
        </div>
      );
    }

    return (
      <div
        key={position.id}
        role="button"
        tabIndex={0}
        className="group relative cursor-pointer py-2 pl-3 pr-12 outline-none transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-label={`View ${position.asset.symbol} position`}
        onClick={() => setViewPosition(position)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setViewPosition(position);
          }
        }}
      >
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <p className="max-w-[5.75rem] shrink-0 truncate text-sm font-semibold leading-tight">
                {position.asset.symbol}
              </p>
              {options.showUnitTrustBadge && isUnitTrust && (
                <span
                  className="inline-flex h-5 shrink-0 items-center rounded-sm border border-warning/35 bg-warning/15 px-1.5 text-[10px] font-semibold leading-none text-warning"
                  aria-label="Unit Trust"
                >
                  UT
                </span>
              )}
              <p className="min-w-0 truncate text-xs leading-snug text-muted-foreground">
                {position.asset.name}
              </p>
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className="font-mono text-sm font-semibold leading-tight tabular-nums">
              {formatCurrency(marketValue, currency, 0)}
            </p>
          </div>

          <span
            className={`min-w-[3.625rem] shrink-0 rounded-md border px-1.5 py-0.5 text-right font-mono text-[10px] font-medium leading-tight tabular-nums ${pnlPillClass}`}
          >
            <span className="block">{formatCurrency(pnlValue, currency, 0)}</span>
            <span className="block">{formatPercent(position.unrealizedPnLPct)}</span>
          </span>
        </div>

        <div className="absolute right-1 top-1/2 -translate-y-1/2">
          {renderMobileActionMenu(position)}
        </div>

        <div className="mt-1 flex min-w-0 flex-nowrap items-center gap-x-1.5 overflow-hidden whitespace-nowrap text-[11px] leading-snug text-muted-foreground">
          <span className="inline-flex shrink-0 gap-1">
            Qty
            <span className="font-mono text-foreground">
              {formatQuantity(position.quantity, position.asset.category)}
            </span>
          </span>
          <span aria-hidden="true" className="shrink-0">
            ·
          </span>
          <span className="inline-flex shrink-0 gap-1">
            Price
            <span className="font-mono text-foreground">
              {formatCurrency(priceValue, currency, getSmartDecimals(priceValue))}
            </span>
          </span>
          <span aria-hidden="true" className="shrink-0">
            ·
          </span>
          <span className="inline-flex shrink-0 gap-1">
            Avg
            <span className="font-mono text-foreground">
              {formatCurrency(avgCostValue, currency, getSmartDecimals(avgCostValue))}
            </span>
          </span>
          <span aria-hidden="true" className="shrink-0">
            ·
          </span>
          <span className="min-w-0 truncate">{mobileStorageLabelFor(position)}</span>
        </div>
      </div>
    );
  };

  const HIDDEN_MOBILE = showAllColumns ? '' : 'hidden md:table-cell';

  const renderCurrentPrice = (position: Position) => {
    const localCurrentPrice = localPriceLabel({
      usdPrice: position.asset.currentPriceUsd,
      nativeCurrency: position.asset.nativeCurrency,
      displayCurrency: currency,
      usdFxRates: priceFxRates,
    });

    return (
      <>
        <p className="font-mono font-medium text-muted-foreground">
          {formatCurrency(
            convert(position.asset.currentPriceUsd),
            currency,
            getSmartDecimals(convert(position.asset.currentPriceUsd))
          )}
        </p>
        {localCurrentPrice && (
          <p className="font-mono text-[11px] leading-none text-muted-foreground/80">
            {localCurrentPrice}
          </p>
        )}
      </>
    );
  };

  const renderAverageCost = (position: Position) => {
    const localAvgCost = localPriceLabel({
      usdPrice: position.avgCostUsd,
      nativeCurrency: position.asset.nativeCurrency,
      displayCurrency: currency,
      usdFxRates: priceFxRates,
    });

    return (
      <>
        <p className="font-mono">
          {formatCurrency(
            convert(position.avgCostUsd),
            currency,
            getSmartDecimals(convert(position.avgCostUsd))
          )}
        </p>
        {localAvgCost && (
          <p className="font-mono text-[11px] leading-none text-muted-foreground/80">
            {localAvgCost}
          </p>
        )}
      </>
    );
  };

  const nativeAmountLabelFor = (
    position: Position,
    usdValue: number | null | undefined
  ): string | null =>
    localAmountLabel({
      usdValue,
      nativeCurrency: position.asset.nativeCurrency,
      displayCurrency: currency,
      usdFxRates: priceFxRates,
    });

  const nativePriceLabelFor = (
    position: Position,
    usdPrice: number | null | undefined
  ): string | null =>
    localPriceLabel({
      usdPrice,
      nativeCurrency: position.asset.nativeCurrency,
      displayCurrency: currency,
      usdFxRates: priceFxRates,
    });

  const renderNativeHint = (
    label: string | null,
    className = 'font-mono text-[11px] leading-none text-muted-foreground/80'
  ) => (label ? <p className={className}>{label}</p> : null);

  const renderAmountWithNative = (
    position: Position,
    usdValue: number | null | undefined,
    options: { className?: string; decimals?: number; nativeClassName?: string } = {}
  ) => (
    <>
      <p className={options.className ?? 'font-mono'}>
        {formatCurrency(convert(usdValue), currency, options.decimals ?? 0)}
      </p>
      {renderNativeHint(nativeAmountLabelFor(position, usdValue), options.nativeClassName)}
    </>
  );

  const renderTableHeader = (sortState: {
    sortKey: string | null;
    sortDirection: SortDirection;
    onSort: (key: string) => void;
  }) => (
    <TableHeader>
      <TableRow>
        <SortableHeader
          label="Asset"
          sortKey="asset"
          activeSortKey={sortState.sortKey}
          sortDirection={sortState.sortDirection}
          onSort={sortState.onSort}
          style={{ width: '9%' }}
        />
        <TableHead scope="col" style={{ width: '12%' }} className={`text-right ${HIDDEN_MOBILE}`}>
          Quantity
        </TableHead>
        <TableHead scope="col" style={{ width: '10%' }} className={`text-right ${HIDDEN_MOBILE}`}>
          Avg Cost
        </TableHead>
        <SortableHeader
          label="Total Cost"
          sortKey="totalCost"
          activeSortKey={sortState.sortKey}
          sortDirection={sortState.sortDirection}
          onSort={sortState.onSort}
          align="right"
          style={{ width: '12%' }}
          className={HIDDEN_MOBILE}
        />
        <TableHead scope="col" style={{ width: '10%' }} className={`text-right ${HIDDEN_MOBILE}`}>
          Price
        </TableHead>
        <SortableHeader
          label="Value"
          sortKey="value"
          activeSortKey={sortState.sortKey}
          sortDirection={sortState.sortDirection}
          onSort={sortState.onSort}
          align="right"
          style={{ width: '12%' }}
        />
        <SortableHeader
          label="P&L"
          sortKey="pnl"
          activeSortKey={sortState.sortKey}
          sortDirection={sortState.sortDirection}
          onSort={sortState.onSort}
          align="right"
          style={{ width: '11%' }}
        />
        <SortableHeader
          label="Storage"
          sortKey="storage"
          activeSortKey={sortState.sortKey}
          sortDirection={sortState.sortDirection}
          onSort={sortState.onSort}
          align="left"
          style={{ width: '9%' }}
          className={HIDDEN_MOBILE}
        />
        <TableHead scope="col" style={{ width: '15%' }} className="text-center">
          Actions
        </TableHead>
      </TableRow>
    </TableHeader>
  );

  const tableClass = showAllColumns ? 'w-full min-w-[700px]' : 'table-fixed w-full';
  const renderSectionTrigger = (
    sectionId: string,
    label: string,
    helpContent: string,
    sectionPositions: Position[],
    total: number
  ) => {
    const isCompactMobile = mobileVariant === 'compact';
    const groupPnL = calculatePositionGroupPnL(sectionPositions);
    const formattedGroupPnL =
      groupPnL.pnlUsd === null
        ? null
        : `${formatCurrency(convertSub(groupPnL.pnlUsd), currency, 0)} (${formatPercent(
            groupPnL.pnlPct
          )})`;
    const formattedTotal = formatCurrency(convertSub(total), currency, 0);

    return (
      <div
        className={cn(
          'flex items-center gap-2',
          isCompactMobile ? 'mb-0 rounded-md bg-muted/25 px-2' : 'mb-2'
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              'group flex min-w-0 flex-1 cursor-pointer select-none items-center gap-2 text-left',
              'min-h-11'
            )}
          >
            <ChevronRight
              className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
                isExpanded(sectionId) ? 'rotate-90' : ''
              }`}
            />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide transition-colors group-hover:text-foreground">
              {label}
            </p>
            <span className="text-xs text-muted-foreground">({sectionPositions.length})</span>
            <span className="ml-auto flex shrink-0 flex-col items-end gap-0.5 font-mono text-xs leading-tight tabular-nums sm:flex-row sm:items-center sm:gap-2">
              {formattedGroupPnL && (
                <span
                  className={getPnLColorClass(groupPnL.pnlUsd)}
                  aria-label={`Unrealized P and L ${formattedGroupPnL}`}
                >
                  {formattedGroupPnL}
                </span>
              )}
              <span className="text-muted-foreground" aria-label={`Group value ${formattedTotal}`}>
                {formattedTotal}
              </span>
            </span>
          </button>
        </CollapsibleTrigger>
        {!isCompactMobile && <HelpTooltip content={helpContent} />}
      </div>
    );
  };

  const renderPositionSection = ({
    id,
    label,
    helpContent,
    positions: sectionPositions,
    total,
    sortState,
    showUnitTrustBadge = false,
  }: {
    id: string;
    label: string;
    helpContent: string;
    positions: Position[];
    total: number;
    sortState: {
      sortKey: string | null;
      sortDirection: SortDirection;
      onSort: (key: string) => void;
    };
    showUnitTrustBadge?: boolean;
  }) => (
    <Collapsible key={id} open={isExpanded(id)} onOpenChange={() => toggle(id)}>
      {renderSectionTrigger(id, label, helpContent, sectionPositions, total)}
      <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden">
        <div
          className={`rounded-md border overflow-x-auto ${showAllColumns ? '' : 'hidden md:block'}`}
        >
          <Table className={tableClass}>
            {renderTableHeader(sortState)}
            <TableBody>
              {sectionPositions.map((position) =>
                renderPositionRow(position, { showUnitTrustBadge })
              )}
            </TableBody>
          </Table>
        </div>
        {!showAllColumns && (
          <div
            className={cn(
              'divide-y divide-border/70 md:hidden',
              mobileVariant === 'compact'
                ? 'overflow-hidden rounded-b-md bg-muted/10'
                : 'border-y border-border/70 bg-transparent'
            )}
          >
            {sectionPositions.map((position) =>
              renderMobilePositionRow(position, { showUnitTrustBadge })
            )}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );

  const renderPositionHistory = (
    history: PositionHistoryEntry[],
    options: { isLoading: boolean; isError: boolean }
  ) => {
    if (!viewPosition) return null;

    const chronologicalHistory = [...history].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    type ActivityRow = {
      id: string;
      label: string;
      date: string;
      quantity: number;
      quantityPrefix: string;
      priceUsd: number;
      nextQuantity: number;
      nextAvgCostUsd: number;
      toneClass: string;
      canCancel: boolean;
      historyEntry: PositionHistoryEntry | null;
      detail?: string;
    };

    let lastResetIndex = -1;
    chronologicalHistory.forEach((entry, index) => {
      if (entry.mode === 'reset') {
        lastResetIndex = index;
      }
    });

    const resetEntry = lastResetIndex >= 0 ? chronologicalHistory[lastResetIndex] : null;
    const historyBeforeReset = resetEntry ? chronologicalHistory.slice(0, lastResetIndex) : [];
    const currentHistoryEntries = resetEntry
      ? chronologicalHistory.slice(lastResetIndex + 1)
      : chronologicalHistory;
    const latestHistoryEntry = chronologicalHistory[chronologicalHistory.length - 1];
    const latestCancelableHistoryId =
      latestHistoryEntry && latestHistoryEntry.mode !== 'reset' ? latestHistoryEntry.id : null;

    const rowForHistoryEntry = (entry: PositionHistoryEntry): ActivityRow => {
      if (entry.mode === 'reset') {
        return {
          id: entry.id,
          label: 'Manual Reset',
          date: entry.createdAt,
          quantity: entry.nextQuantity,
          quantityPrefix: '',
          priceUsd: entry.nextAvgCostUsd,
          nextQuantity: entry.nextQuantity,
          nextAvgCostUsd: entry.nextAvgCostUsd,
          toneClass: 'text-info',
          canCancel: false,
          historyEntry: entry,
          detail: `Previous baseline: ${formatQuantity(
            entry.previousQuantity,
            viewPosition.asset.category
          )}`,
        };
      }

      const isAdd = entry.mode === 'add';
      return {
        id: entry.id,
        label: isAdd ? 'Add' : 'Reduce',
        date: entry.createdAt,
        quantity: entry.quantity,
        quantityPrefix: isAdd ? '+' : '-',
        priceUsd: entry.quantity > 0 ? entry.costBasisUsd / entry.quantity : 0,
        nextQuantity: entry.nextQuantity,
        nextAvgCostUsd: entry.nextAvgCostUsd,
        toneClass: isAdd ? 'text-profit' : 'text-loss',
        canCancel: entry.id === latestCancelableHistoryId,
        historyEntry: entry,
      };
    };

    const firstPreviousChange = historyBeforeReset[0];
    const previousRows: ActivityRow[] = resetEntry
      ? [
          {
            id: 'previous-original',
            label: 'Original',
            date: viewPosition.createdAt,
            quantity: firstPreviousChange?.previousQuantity ?? resetEntry.previousQuantity,
            quantityPrefix: '',
            priceUsd: firstPreviousChange?.previousAvgCostUsd ?? resetEntry.previousAvgCostUsd,
            nextQuantity: firstPreviousChange?.previousQuantity ?? resetEntry.previousQuantity,
            nextAvgCostUsd:
              firstPreviousChange?.previousAvgCostUsd ?? resetEntry.previousAvgCostUsd,
            toneClass: 'text-foreground',
            canCancel: false,
            historyEntry: null,
          },
          ...historyBeforeReset.map(rowForHistoryEntry),
        ]
      : [];

    const firstCurrentChange = currentHistoryEntries[0];
    const currentRows: ActivityRow[] = [
      {
        id: resetEntry ? `current-baseline-${resetEntry.id}` : 'original',
        label: resetEntry ? 'Current Baseline' : 'Original',
        date: resetEntry?.createdAt ?? viewPosition.createdAt,
        quantity:
          resetEntry?.nextQuantity ?? firstCurrentChange?.previousQuantity ?? viewPosition.quantity,
        quantityPrefix: '',
        priceUsd:
          resetEntry?.nextAvgCostUsd ??
          firstCurrentChange?.previousAvgCostUsd ??
          viewPosition.avgCostUsd,
        nextQuantity:
          resetEntry?.nextQuantity ?? firstCurrentChange?.previousQuantity ?? viewPosition.quantity,
        nextAvgCostUsd:
          resetEntry?.nextAvgCostUsd ??
          firstCurrentChange?.previousAvgCostUsd ??
          viewPosition.avgCostUsd,
        toneClass: resetEntry ? 'text-info' : 'text-foreground',
        canCancel: false,
        historyEntry: null,
        detail: resetEntry ? 'Manual total correction starts a new active history.' : undefined,
      },
      ...currentHistoryEntries.map(rowForHistoryEntry),
    ];
    const activityRowCount = previousRows.length + currentRows.length;

    const renderActivityRows = (rows: ActivityRow[]) =>
      rows.map((entry) => {
        const localExecutionPrice = nativePriceLabelFor(viewPosition, entry.priceUsd);
        const localNextAvgCost = nativePriceLabelFor(viewPosition, entry.nextAvgCostUsd);

        return (
          <div
            key={entry.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className={`text-xs font-medium uppercase ${entry.toneClass}`}>
                  {entry.label}
                </span>
                <span className="text-xs text-muted-foreground">{formatDateTime(entry.date)}</span>
              </div>
              <div className="mt-0.5 text-sm leading-snug">
                <p className="flex min-w-0 flex-wrap items-start gap-x-1">
                  <span className={`font-mono font-medium ${entry.toneClass}`}>
                    {entry.quantityPrefix}
                    {formatQuantity(entry.quantity, viewPosition.asset.category)}
                  </span>
                  <span>{viewPosition.asset.symbol}</span>
                  <span className="text-muted-foreground"> @ </span>
                  <span className="inline-flex min-w-0 flex-col">
                    <span className="font-mono">
                      {formatCurrency(
                        convert(entry.priceUsd),
                        currency,
                        getSmartDecimals(convert(entry.priceUsd))
                      )}
                    </span>
                    {localExecutionPrice && (
                      <span className="font-mono text-[11px] leading-none text-muted-foreground/80">
                        {localExecutionPrice}
                      </span>
                    )}
                  </span>
                </p>
              </div>
              {entry.detail && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{entry.detail}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2 text-right">
              <div>
                <p className="font-mono text-sm font-medium">
                  {formatQuantity(entry.nextQuantity, viewPosition.asset.category)}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  avg{' '}
                  {formatCurrency(
                    convert(entry.nextAvgCostUsd),
                    currency,
                    getSmartDecimals(convert(entry.nextAvgCostUsd))
                  )}
                </p>
                {renderNativeHint(localNextAvgCost)}
              </div>
              {entry.canCancel && entry.historyEntry && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="-mr-1 shrink-0 text-destructive touch-manipulation hover:text-destructive"
                  aria-label={`Delete ${entry.label.toLowerCase()} history entry`}
                  title="Delete history entry"
                  onClick={() => {
                    cancelPositionHistoryMutation.reset();
                    setCancelHistoryEntry(entry.historyEntry);
                  }}
                  disabled={cancelPositionHistoryMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        );
      });

    return (
      <div className="border-t pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Position History
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {activityRowCount} {activityRowCount === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {options.isLoading ? (
          <p className="rounded-md border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
            Loading activity...
          </p>
        ) : options.isError ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-4 text-sm text-destructive">
            Could not load activity history.
          </p>
        ) : (
          <div className="rounded-md border bg-muted/10">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>Entry</span>
              <span className="text-right">New Qty / Avg</span>
            </div>
            <div>
              {previousRows.length > 0 && (
                <details className="border-b bg-background/50">
                  <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                    Previous history before manual correction ({previousRows.length})
                  </summary>
                  <div className="divide-y border-t">{renderActivityRows(previousRows)}</div>
                </details>
              )}
              <div className="divide-y">{renderActivityRows(currentRows)}</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="space-y-4">
        {showMobileColumnToggle && (
          <div className="-mb-2 -mt-1 flex justify-end md:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground touch-manipulation"
              onClick={() => setShowAllColumns(!showAllColumns)}
              aria-label={showAllColumns ? 'Show compact mobile list' : 'Show all table columns'}
              title={showAllColumns ? 'Compact' : 'All columns'}
            >
              {showAllColumns ? <Columns2 className="h-4 w-4" /> : <Columns3 className="h-4 w-4" />}
            </Button>
          </div>
        )}

        {groupBy === 'storage' &&
          cexPositions.length > 0 &&
          renderPositionSection({
            id: cexId,
            label: 'CEX',
            helpContent: 'Centralized exchange: assets held on platforms like Binance or Coinbase',
            positions: cexPositions,
            total: cexTotal,
            sortState: cexSort,
          })}

        {groupBy === 'storage' &&
          brokeragePositions.length > 0 &&
          renderPositionSection({
            id: brokerageId,
            label: 'Broker account',
            helpContent: 'Assets held in broker accounts or fund platforms',
            positions: brokeragePositions,
            total: brokerageTotal,
            sortState: brokerageSort,
          })}

        {groupBy === 'storage' &&
          bankPositions.length > 0 &&
          renderPositionSection({
            id: bankId,
            label: 'Bank',
            helpContent: 'Cash held directly in bank accounts',
            positions: bankPositions,
            total: bankTotal,
            sortState: bankSort,
          })}

        {groupBy === 'equityType' &&
          singlePositions.length > 0 &&
          renderPositionSection({
            id: singleId,
            label: 'Stock / ETF',
            helpContent: 'Stocks and ETFs (e.g. AAPL, D05.SI, EWY) priced live via Yahoo Finance',
            positions: singlePositions,
            total: singleTotal,
            sortState: singleSort,
          })}

        {groupBy === 'equityType' &&
          fundPositions.length > 0 &&
          renderPositionSection({
            id: fundId,
            label: 'Unit Trust',
            helpContent:
              'Unit trusts and managed funds: NAV tracked per fund, often from broker statements',
            positions: fundPositions,
            total: fundTotal,
            sortState: fundSort,
          })}

        {groupBy === 'broker' &&
          brokerGroups.map((brokerGroup) =>
            renderPositionSection({
              id: brokerGroup.id,
              label: brokerGroup.label,
              helpContent: 'Positions held at this broker or fund platform',
              positions: brokerGroup.positions,
              total: brokerGroup.total,
              sortState: brokerSort,
              showUnitTrustBadge: true,
            })
          )}

        {groupBy === 'storage' &&
          onchainPositions.length > 0 &&
          renderPositionSection({
            id: onchainId,
            label: 'Onchain',
            helpContent: 'Assets in your own wallets (not on an exchange)',
            positions: onchainPositions,
            total: onchainTotal,
            sortState: onchainSort,
          })}

        {positions.length === 0 && (
          <div className="rounded-md border overflow-hidden">
            <Table className="table-fixed w-full">
              {renderTableHeader(cexSort)}
              <TableBody>
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No positions yet
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={!!editPosition} onOpenChange={() => setEditPosition(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Position</DialogTitle>
            <DialogDescription className="sr-only">
              Edit totals or add and reduce the selected position.
            </DialogDescription>
          </DialogHeader>
          {editPosition && (
            <PositionForm position={editPosition} onSuccess={() => setEditPosition(null)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deletePosition}
        onOpenChange={() => {
          setDeletePosition(null);
          setDontAskAgain(false);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Delete Position</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete your {deletePosition?.asset.symbol} position? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2 py-2">
            <Checkbox
              id="dontAskAgain"
              checked={dontAskAgain}
              onCheckedChange={(checked) => setDontAskAgain(checked === true)}
            />
            <label htmlFor="dontAskAgain" className="text-sm text-muted-foreground cursor-pointer">
              Don't ask me again
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeletePosition(null);
                setDontAskAgain(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deletePositionMutation.isPending}
            >
              {deletePositionMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!viewPosition}
        onOpenChange={() => {
          setViewPosition(null);
          setCancelHistoryEntry(null);
        }}
      >
        <DialogContent className="!bottom-0 !left-0 !top-auto max-h-[85vh] w-full max-w-none !translate-x-0 !translate-y-0 overflow-y-auto rounded-b-none rounded-t-lg sm:!bottom-auto sm:!left-[50%] sm:!top-[50%] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:!translate-x-[-50%] sm:!translate-y-[-50%] sm:rounded-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{viewPosition?.asset.symbol}</span>
              <span className="text-muted-foreground font-normal">{viewPosition?.asset.name}</span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Position summary, storage details, add and reduce activity, and position actions.
            </DialogDescription>
          </DialogHeader>
          {viewPosition && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Quantity</p>
                  <p className="font-mono font-medium">
                    {formatQuantity(viewPosition.quantity, viewPosition.asset.category)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Current Price</p>
                  {renderCurrentPrice(viewPosition)}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Average Cost</p>
                  {renderAverageCost(viewPosition)}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Total Cost</p>
                  {renderAmountWithNative(
                    viewPosition,
                    viewPosition.quantity * viewPosition.avgCostUsd
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Market Value</p>
                  {renderAmountWithNative(viewPosition, viewPosition.marketValueUsd, {
                    className: 'font-mono font-medium',
                  })}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Unrealized P&L</p>
                  <p
                    className={`font-mono font-medium ${getPnLColorClass(viewPosition.unrealizedPnL)}`}
                  >
                    {formatCurrency(convert(viewPosition.unrealizedPnL), currency, 0)}
                    <span className="text-xs ml-1">
                      ({formatPercent(viewPosition.unrealizedPnLPct)})
                    </span>
                  </p>
                  {renderNativeHint(
                    nativeAmountLabelFor(viewPosition, viewPosition.unrealizedPnL),
                    `font-mono text-[11px] leading-none ${getPnLColorClass(
                      viewPosition.unrealizedPnL
                    )}`
                  )}
                </div>
              </div>

              <div className="border-t pt-4">
                {viewPosition.storageType === 'BROKERAGE' ? (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Broker</p>
                    <p className="text-sm">{viewPosition.storageLocation || 'Broker account'}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Storage Type</p>
                      <p className="text-sm">
                        {STORAGE_TYPE_LABELS[viewPosition.storageType] || viewPosition.storageType}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Storage Location</p>
                      <p className="text-sm">{viewPosition.storageLocation || '-'}</p>
                    </div>
                  </div>
                )}
              </div>

              {viewPosition.notes && (
                <div className="border-t pt-4">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-md">
                    {viewPosition.notes}
                  </p>
                </div>
              )}

              {renderPositionHistory(positionHistory, {
                isLoading: isHistoryLoading,
                isError: isHistoryError,
              })}

              <div className="border-t pt-4 text-xs text-muted-foreground">
                <p>Created: {formatDateTime(viewPosition.createdAt)}</p>
                <p>Updated: {formatDateTime(viewPosition.updatedAt)}</p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const success = await copyPositionsToClipboard(viewPosition);
                    if (success) {
                      setCopiedId(viewPosition.id);
                      setTimeout(() => setCopiedId(null), 2000);
                    }
                  }}
                >
                  {copiedId === viewPosition.id ? (
                    <Check className="h-3.5 w-3.5 mr-1 text-profit" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 mr-1" />
                  )}
                  {copiedId === viewPosition.id ? 'Copied!' : 'Copy'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setViewPosition(null);
                    setEditPosition(viewPosition);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setViewPosition(null);
                    handleDeleteClick(viewPosition);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!cancelHistoryEntry}
        onOpenChange={(open) => {
          if (!open) {
            setCancelHistoryEntry(null);
            cancelPositionHistoryMutation.reset();
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cancel History Entry</DialogTitle>
            <DialogDescription>
              Restore {viewPosition?.asset.symbol} to the quantity and average cost it had before
              this {cancelHistoryEntry?.mode} entry.
            </DialogDescription>
          </DialogHeader>
          {cancelHistoryEntry && viewPosition && (
            <div className="rounded-md border bg-muted/10 p-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Current quantity</p>
                  <p className="font-mono">
                    {formatQuantity(cancelHistoryEntry.nextQuantity, viewPosition.asset.category)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Restored quantity</p>
                  <p className="font-mono">
                    {formatQuantity(
                      cancelHistoryEntry.previousQuantity,
                      viewPosition.asset.category
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Current avg</p>
                  <p className="font-mono">
                    {formatCurrency(
                      convert(cancelHistoryEntry.nextAvgCostUsd),
                      currency,
                      getSmartDecimals(convert(cancelHistoryEntry.nextAvgCostUsd))
                    )}
                  </p>
                  {renderNativeHint(
                    nativePriceLabelFor(viewPosition, cancelHistoryEntry.nextAvgCostUsd)
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Restored avg</p>
                  <p className="font-mono">
                    {formatCurrency(
                      convert(cancelHistoryEntry.previousAvgCostUsd),
                      currency,
                      getSmartDecimals(convert(cancelHistoryEntry.previousAvgCostUsd))
                    )}
                  </p>
                  {renderNativeHint(
                    nativePriceLabelFor(viewPosition, cancelHistoryEntry.previousAvgCostUsd)
                  )}
                </div>
              </div>
            </div>
          )}
          {cancelPositionHistoryMutation.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {cancelPositionHistoryMutation.error instanceof Error
                ? cancelPositionHistoryMutation.error.message
                : 'Could not cancel this history entry.'}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelHistoryEntry(null);
                cancelPositionHistoryMutation.reset();
              }}
            >
              Keep Entry
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelHistoryEntry}
              disabled={cancelPositionHistoryMutation.isPending}
            >
              {cancelPositionHistoryMutation.isPending ? 'Canceling...' : 'Cancel Entry'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

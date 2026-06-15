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
  formatNumber,
  formatPercent,
  formatDateTime,
  getPnLColorClass,
  isStablecoinCategory,
} from '@/lib/utils';
import { useDeletePosition, usePositionHistory } from '@/hooks/usePortfolio';
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
} from 'lucide-react';
import { useCollapsibleState } from '@/hooks/useCollapsibleState';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableHeader } from '@/components/ui/SortableHeader';
import type { ColumnConfig, SortDirection } from '@/hooks/useTableSort';
import type { Position, PositionHistoryEntry } from '@/lib/types';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { copyPositionsToClipboard } from '@/components/portfolio/positionClipboard';

const SKIP_DELETE_CONFIRM_KEY = 'foliobuddy-skip-delete-confirm';
const LEGACY_SKIP_DELETE_KEY = 'pa-portfolio-skip-delete-confirm';
type PositionGroupBy = 'storage' | 'equityType' | 'broker';

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
  sectionPrefix?: string;
  onUpdateNav?: (position: Position) => void;
  /**
   * How to sub-group rows inside the card:
   * - 'storage' (default): CEX / Broker account / Bank / Onchain — used for crypto/cash/custody
   * - 'equityType': Single / Fund-level (by asset.category) — used for Equities
   * - 'broker': individual broker/fund platform names — used for Equities
   */
  groupBy?: PositionGroupBy;
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

function historyQuantityDecimals(position: Position) {
  return isStablecoinCategory(position.asset.category) || position.asset.category === 'CASH'
    ? 0
    : 4;
}

export function PositionTable({
  positions,
  currency = 'USD',
  fxRate = 1,
  sectionPrefix,
  onUpdateNav,
  groupBy = 'storage',
}: PositionTableProps) {
  const [viewPosition, setViewPosition] = useState<Position | null>(null);
  const [editPosition, setEditPosition] = useState<Position | null>(null);
  const [deletePosition, setDeletePosition] = useState<Position | null>(null);
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
  const deletePositionMutation = useDeletePosition();
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

  const convert = (usdValue: number | null | undefined) => {
    if (usdValue === null || usdValue === undefined) return usdValue;
    return currency === 'SGD' ? usdValue * fxRate : usdValue;
  };

  const getSmartDecimals = (value: number | null | undefined): number => {
    if (value === null || value === undefined) return 2;
    const absValue = Math.abs(value);
    return absValue < 1000 ? 2 : 0;
  };

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

  const handleView = useCallback((position: Position) => setViewPosition(position), []);
  const handleEdit = useCallback((position: Position) => setEditPosition(position), []);

  const renderPositionRow = (
    position: Position,
    options: { showUnitTrustBadge?: boolean } = {}
  ) => {
    return (
      <PositionRow
        key={position.id}
        position={position}
        currency={currency}
        fxRate={fxRate}
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
  };

  const HIDDEN_MOBILE = showAllColumns ? '' : 'hidden md:table-cell';

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
    count: number,
    total: number
  ) => (
    <div className="mb-2 flex items-center gap-2">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex min-h-11 min-w-0 flex-1 cursor-pointer select-none items-center gap-2 text-left"
        >
          <ChevronRight
            className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
              isExpanded(sectionId) ? 'rotate-90' : ''
            }`}
          />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide transition-colors group-hover:text-foreground">
            {label}
          </p>
          <span className="text-xs text-muted-foreground">({count})</span>
          {!isExpanded(sectionId) && (
            <span className="ml-auto text-xs font-mono text-muted-foreground">
              {formatCurrency(convertSub(total), currency, 0)}
            </span>
          )}
        </button>
      </CollapsibleTrigger>
      <HelpTooltip content={helpContent} />
    </div>
  );

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
      {renderSectionTrigger(id, label, helpContent, sectionPositions.length, total)}
      <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden">
        <div className="rounded-md border overflow-x-auto">
          <Table className={tableClass}>
            {renderTableHeader(sortState)}
            <TableBody>
              {sectionPositions.map((position) =>
                renderPositionRow(position, { showUnitTrustBadge })
              )}
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );

  const renderPositionHistory = (
    history: PositionHistoryEntry[],
    options: { isLoading: boolean; isError: boolean }
  ) => {
    if (!viewPosition) return null;

    const qtyDecimals = historyQuantityDecimals(viewPosition);
    const chronologicalHistory = [...history].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const firstChange = chronologicalHistory[0];
    const activityRows = [
      {
        id: 'original',
        label: 'Original',
        date: viewPosition.createdAt,
        quantity: firstChange?.previousQuantity ?? viewPosition.quantity,
        quantityPrefix: '',
        priceUsd: firstChange?.previousAvgCostUsd ?? viewPosition.avgCostUsd,
        nextQuantity: firstChange?.previousQuantity ?? viewPosition.quantity,
        nextAvgCostUsd: firstChange?.previousAvgCostUsd ?? viewPosition.avgCostUsd,
        toneClass: 'text-foreground',
      },
      ...chronologicalHistory.map((entry) => {
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
        };
      }),
    ];

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
            {activityRows.length} {activityRows.length === 1 ? 'entry' : 'entries'}
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
            <div className="divide-y">
              {activityRows.map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className={`text-xs font-medium uppercase ${entry.toneClass}`}>
                        {entry.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(entry.date)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm">
                      <span className={`font-mono font-medium ${entry.toneClass}`}>
                        {entry.quantityPrefix}
                        {formatNumber(entry.quantity, qtyDecimals)}
                      </span>{' '}
                      <span>{viewPosition.asset.symbol}</span>
                      <span className="text-muted-foreground"> @ </span>
                      <span className="font-mono">
                        {formatCurrency(
                          convert(entry.priceUsd),
                          currency,
                          getSmartDecimals(convert(entry.priceUsd))
                        )}
                      </span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-sm font-medium">
                      {formatNumber(entry.nextQuantity, qtyDecimals)}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      avg{' '}
                      {formatCurrency(
                        convert(entry.nextAvgCostUsd),
                        currency,
                        getSmartDecimals(convert(entry.nextAvgCostUsd))
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-end md:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="h-11 text-xs text-muted-foreground touch-manipulation"
            onClick={() => setShowAllColumns(!showAllColumns)}
          >
            {showAllColumns ? (
              <>
                <Columns2 className="h-3.5 w-3.5 mr-1" /> Compact
              </>
            ) : (
              <>
                <Columns3 className="h-3.5 w-3.5 mr-1" /> All columns
              </>
            )}
          </Button>
        </div>

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
            <input
              type="checkbox"
              id="dontAskAgain"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
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

      <Dialog open={!!viewPosition} onOpenChange={() => setViewPosition(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
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
                    {isStablecoinCategory(viewPosition.asset.category)
                      ? formatNumber(viewPosition.quantity, 0)
                      : formatNumber(viewPosition.quantity, 4)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Current Price</p>
                  <p className="font-mono font-medium text-muted-foreground">
                    {formatCurrency(
                      convert(viewPosition.asset.currentPriceUsd),
                      currency,
                      getSmartDecimals(convert(viewPosition.asset.currentPriceUsd))
                    )}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Average Cost</p>
                  <p className="font-mono">
                    {formatCurrency(
                      convert(viewPosition.avgCostUsd),
                      currency,
                      getSmartDecimals(convert(viewPosition.avgCostUsd))
                    )}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Total Cost</p>
                  <p className="font-mono">
                    {formatCurrency(
                      convert(viewPosition.quantity * viewPosition.avgCostUsd),
                      currency,
                      0
                    )}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Market Value</p>
                  <p className="font-mono font-medium">
                    {formatCurrency(convert(viewPosition.marketValueUsd), currency, 0)}
                  </p>
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
    </>
  );
}

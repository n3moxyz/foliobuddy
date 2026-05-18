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
import { useDeletePosition } from '@/hooks/usePortfolio';
import { PositionForm } from './PositionForm';
import { PositionRow } from './PositionRow';
import { Copy, Check, ChevronRight, Pencil, Trash2, Columns3, Columns2 } from 'lucide-react';
import { useCollapsibleState } from '@/hooks/useCollapsibleState';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableHeader } from '@/components/ui/SortableHeader';
import type { ColumnConfig, SortDirection } from '@/hooks/useTableSort';
import type { Position } from '@/lib/types';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { copyPositionsToClipboard } from '@/components/portfolio/positionClipboard';

const SKIP_DELETE_CONFIRM_KEY = 'foliobuddy-skip-delete-confirm';
const LEGACY_SKIP_DELETE_KEY = 'pa-portfolio-skip-delete-confirm';

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
   */
  groupBy?: 'storage' | 'equityType';
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

    cex.sort((a, b) => (b.marketValueUsd ?? 0) - (a.marketValueUsd ?? 0));
    brokerage.sort((a, b) => (b.marketValueUsd ?? 0) - (a.marketValueUsd ?? 0));
    bank.sort((a, b) => (b.marketValueUsd ?? 0) - (a.marketValueUsd ?? 0));

    // Ledger positions sort to the top; ties break by market value
    onchain.sort((a, b) => {
      const aIsLedger = a.storageLocation?.toLowerCase().includes('ledger') ? 1 : 0;
      const bIsLedger = b.storageLocation?.toLowerCase().includes('ledger') ? 1 : 0;
      if (aIsLedger !== bIsLedger) return bIsLedger - aIsLedger;
      return (b.marketValueUsd ?? 0) - (a.marketValueUsd ?? 0);
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
    const byMv = (a: Position, b: Position) => (b.marketValueUsd ?? 0) - (a.marketValueUsd ?? 0);
    single.sort(byMv);
    fund.sort(byMv);
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

  const renderPositionRow = (position: Position) => {
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
          align="right"
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

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-end md:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground touch-manipulation"
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

        {cexPositions.length > 0 && (
          <Collapsible open={isExpanded(cexId)} onOpenChange={() => toggle(cexId)}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full text-left flex items-center gap-2 cursor-pointer select-none group mb-2"
              >
                <ChevronRight
                  className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
                    isExpanded(cexId) ? 'rotate-90' : ''
                  }`}
                />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide group-hover:text-foreground transition-colors">
                  CEX
                  <HelpTooltip content="Centralized exchange — assets held on platforms like Binance or Coinbase" />
                </p>
                <span className="text-xs text-muted-foreground">({cexPositions.length})</span>
                {!isExpanded(cexId) && (
                  <span className="text-xs font-mono text-muted-foreground ml-auto">
                    {formatCurrency(convertSub(cexTotal), currency, 0)}
                  </span>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden">
              <div className="rounded-md border overflow-x-auto">
                <Table className={tableClass}>
                  {renderTableHeader(cexSort)}
                  <TableBody>{cexPositions.map(renderPositionRow)}</TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {groupBy !== 'equityType' && brokeragePositions.length > 0 && (
          <Collapsible open={isExpanded(brokerageId)} onOpenChange={() => toggle(brokerageId)}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full text-left flex items-center gap-2 cursor-pointer select-none group mb-2"
              >
                <ChevronRight
                  className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
                    isExpanded(brokerageId) ? 'rotate-90' : ''
                  }`}
                />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide group-hover:text-foreground transition-colors">
                  Broker account
                  <HelpTooltip content="Assets held in broker accounts or fund platforms" />
                </p>
                <span className="text-xs text-muted-foreground">({brokeragePositions.length})</span>
                {!isExpanded(brokerageId) && (
                  <span className="text-xs font-mono text-muted-foreground ml-auto">
                    {formatCurrency(convertSub(brokerageTotal), currency, 0)}
                  </span>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden">
              <div className="rounded-md border overflow-x-auto">
                <Table className={tableClass}>
                  {renderTableHeader(brokerageSort)}
                  <TableBody>{brokeragePositions.map(renderPositionRow)}</TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {groupBy !== 'equityType' && bankPositions.length > 0 && (
          <Collapsible open={isExpanded(bankId)} onOpenChange={() => toggle(bankId)}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full text-left flex items-center gap-2 cursor-pointer select-none group mb-2"
              >
                <ChevronRight
                  className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
                    isExpanded(bankId) ? 'rotate-90' : ''
                  }`}
                />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide group-hover:text-foreground transition-colors">
                  Bank
                  <HelpTooltip content="Cash held directly in bank accounts" />
                </p>
                <span className="text-xs text-muted-foreground">({bankPositions.length})</span>
                {!isExpanded(bankId) && (
                  <span className="text-xs font-mono text-muted-foreground ml-auto">
                    {formatCurrency(convertSub(bankTotal), currency, 0)}
                  </span>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden">
              <div className="rounded-md border overflow-x-auto">
                <Table className={tableClass}>
                  {renderTableHeader(bankSort)}
                  <TableBody>{bankPositions.map(renderPositionRow)}</TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {groupBy === 'equityType' && singlePositions.length > 0 && (
          <Collapsible open={isExpanded(singleId)} onOpenChange={() => toggle(singleId)}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full text-left flex items-center gap-2 cursor-pointer select-none group mb-2"
              >
                <ChevronRight
                  className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
                    isExpanded(singleId) ? 'rotate-90' : ''
                  }`}
                />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide group-hover:text-foreground transition-colors">
                  Stock / ETF
                  <HelpTooltip content="Stocks and ETFs (e.g. AAPL, D05.SI, EWY) priced live via Yahoo Finance" />
                </p>
                <span className="text-xs text-muted-foreground">({singlePositions.length})</span>
                {!isExpanded(singleId) && (
                  <span className="text-xs font-mono text-muted-foreground ml-auto">
                    {formatCurrency(convertSub(singleTotal), currency, 0)}
                  </span>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden">
              <div className="rounded-md border overflow-x-auto">
                <Table className={tableClass}>
                  {renderTableHeader(singleSort)}
                  <TableBody>{singlePositions.map(renderPositionRow)}</TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {groupBy === 'equityType' && fundPositions.length > 0 && (
          <Collapsible open={isExpanded(fundId)} onOpenChange={() => toggle(fundId)}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full text-left flex items-center gap-2 cursor-pointer select-none group mb-2"
              >
                <ChevronRight
                  className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
                    isExpanded(fundId) ? 'rotate-90' : ''
                  }`}
                />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide group-hover:text-foreground transition-colors">
                  Unit Trust
                  <HelpTooltip content="Unit trusts and managed funds — NAV tracked per fund, often from broker statements" />
                </p>
                <span className="text-xs text-muted-foreground">({fundPositions.length})</span>
                {!isExpanded(fundId) && (
                  <span className="text-xs font-mono text-muted-foreground ml-auto">
                    {formatCurrency(convertSub(fundTotal), currency, 0)}
                  </span>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden">
              <div className="rounded-md border overflow-x-auto">
                <Table className={tableClass}>
                  {renderTableHeader(fundSort)}
                  <TableBody>{fundPositions.map(renderPositionRow)}</TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {onchainPositions.length > 0 && (
          <Collapsible open={isExpanded(onchainId)} onOpenChange={() => toggle(onchainId)}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full text-left flex items-center gap-2 cursor-pointer select-none group mb-2"
              >
                <ChevronRight
                  className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
                    isExpanded(onchainId) ? 'rotate-90' : ''
                  }`}
                />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide group-hover:text-foreground transition-colors">
                  Onchain
                  <HelpTooltip content="Assets in your own wallets (not on an exchange)" />
                </p>
                <span className="text-xs text-muted-foreground">({onchainPositions.length})</span>
                {!isExpanded(onchainId) && (
                  <span className="text-xs font-mono text-muted-foreground ml-auto">
                    {formatCurrency(convertSub(onchainTotal), currency, 0)}
                  </span>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden">
              <div className="rounded-md border overflow-x-auto">
                <Table className={tableClass}>
                  {renderTableHeader(onchainSort)}
                  <TableBody>{onchainPositions.map(renderPositionRow)}</TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

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
                    <Check className="h-3.5 w-3.5 mr-1 text-green-500" />
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

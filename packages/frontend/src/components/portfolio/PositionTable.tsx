import { useState, useMemo } from 'react';
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
import { formatCurrency, formatNumber, formatPercent, formatDateTime, getPnLColorClass } from '@/lib/utils';
import { useDeletePosition } from '@/hooks/usePortfolio';
import { PositionForm } from './PositionForm';
import { PositionRow } from './PositionRow';
import { Copy, Check, ChevronRight, Pencil, Trash2, Columns3, Columns2 } from 'lucide-react';
import { useCollapsibleState } from '@/hooks/useCollapsibleState';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableHeader } from '@/components/ui/SortableHeader';
import type { ColumnConfig, SortDirection } from '@/hooks/useTableSort';
import type { Position } from '@/lib/api';

const SKIP_DELETE_CONFIRM_KEY = 'pa-portfolio-skip-delete-confirm';

// Format position(s) for clipboard - includes asset info for recreating
export function formatPositionsForClipboard(positions: Position | Position[]) {
  const posArray = Array.isArray(positions) ? positions : [positions];

  const formatted = posArray.map(p => ({
    asset: {
      coingeckoId: p.asset.coingeckoId,
      symbol: p.asset.symbol,
      name: p.asset.name,
      category: p.asset.category,
    },
    quantity: p.quantity,
    avgCostUsd: p.avgCostUsd,
    storageType: p.storageType,
    storageLocation: p.storageLocation,
    notes: p.notes,
  }));

  return JSON.stringify(formatted, null, 2);
}

export async function copyPositionsToClipboard(positions: Position | Position[]): Promise<boolean> {
  try {
    const text = formatPositionsForClipboard(positions);
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

interface PositionTableProps {
  positions: Position[];
  currency?: 'USD' | 'SGD';
  fxRate?: number;
  sectionPrefix?: string;
}

const STORAGE_TYPE_LABELS: Record<string, string> = {
  WALLET: 'Onchain',
  CEX: 'CEX',
  DEFI: 'DeFi',
  BANK: 'Bank',
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

export function PositionTable({ positions, currency = 'USD', fxRate = 1, sectionPrefix }: PositionTableProps) {
  const [viewPosition, setViewPosition] = useState<Position | null>(null);
  const [editPosition, setEditPosition] = useState<Position | null>(null);
  const [deletePosition, setDeletePosition] = useState<Position | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState(() => {
    return localStorage.getItem(SKIP_DELETE_CONFIRM_KEY) === 'true';
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAllColumns, setShowAllColumns] = useState(false);
  const deletePositionMutation = useDeletePosition();

  const handleCopy = async (position: Position, e: React.MouseEvent) => {
    e.stopPropagation();
    const success = await copyPositionsToClipboard(position);
    if (success) {
      setCopiedId(position.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Helper to convert USD values to selected currency
  const convert = (usdValue: number | null | undefined) => {
    if (usdValue === null || usdValue === undefined) return usdValue;
    return currency === 'SGD' ? usdValue * fxRate : usdValue;
  };

  // Smart decimal formatting: 3 digits or less = 2dp, 4+ digits = 0dp
  const getSmartDecimals = (value: number | null | undefined): number => {
    if (value === null || value === undefined) return 2;
    const absValue = Math.abs(value);
    return absValue < 1000 ? 2 : 0;
  };

  const { isExpanded, toggle } = useCollapsibleState();

  // Split positions into CEX and Onchain sub-groups
  const { defaultCex, defaultOnchain, cexTotal, onchainTotal } = useMemo(() => {
    const cex: Position[] = [];
    const onchain: Position[] = [];

    positions.forEach(pos => {
      if (pos.storageType === 'CEX') {
        cex.push(pos);
      } else {
        onchain.push(pos);
      }
    });

    // Sort CEX by market value (largest first)
    cex.sort((a, b) => (b.marketValueUsd ?? 0) - (a.marketValueUsd ?? 0));

    // Sort Onchain: Ledger first, then by market value
    onchain.sort((a, b) => {
      const aIsLedger = a.storageLocation?.toLowerCase().includes('ledger') ? 1 : 0;
      const bIsLedger = b.storageLocation?.toLowerCase().includes('ledger') ? 1 : 0;
      if (aIsLedger !== bIsLedger) return bIsLedger - aIsLedger;
      return (b.marketValueUsd ?? 0) - (a.marketValueUsd ?? 0);
    });

    return {
      defaultCex: cex,
      defaultOnchain: onchain,
      cexTotal: cex.reduce((s, p) => s + (p.marketValueUsd || 0), 0),
      onchainTotal: onchain.reduce((s, p) => s + (p.marketValueUsd || 0), 0),
    };
  }, [positions]);

  // Independent sort hooks for each sub-group
  const cexSort = useTableSort(defaultCex, POSITION_COLUMNS);
  const onchainSort = useTableSort(defaultOnchain, POSITION_COLUMNS);
  const cexPositions = cexSort.sortedItems;
  const onchainPositions = onchainSort.sortedItems;

  // Helper to convert for sub-group headers
  const convertSub = (usdValue: number) => {
    return currency === 'SGD' ? usdValue * fxRate : usdValue;
  };

  // Collapsible IDs
  const cexId = sectionPrefix ? `${sectionPrefix}-cex` : 'cex';
  const onchainId = sectionPrefix ? `${sectionPrefix}-onchain` : 'onchain';

  const handleDeleteClick = (position: Position) => {
    if (skipConfirm) {
      deletePositionMutation.mutate(position.id);
    } else {
      setDeletePosition(position);
    }
  };

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

  // Render a position row
  const renderPositionRow = (position: Position) => {
    return (
      <PositionRow
        key={position.id}
        position={position}
        currency={currency}
        fxRate={fxRate}
        copiedId={copiedId}
        showAllColumns={showAllColumns}
        onView={setViewPosition}
        onEdit={setEditPosition}
        onDelete={handleDeleteClick}
        onCopy={handleCopy}
      />
    );
  };

  // Render table header with sort controls
  // When compact: hide secondary columns on mobile. When expanded: show all + scroll.
  const HIDDEN_MOBILE = showAllColumns ? '' : 'hidden md:table-cell';

  const renderTableHeader = (sortState: { sortKey: string | null; sortDirection: SortDirection; onSort: (key: string) => void }) => (
    <TableHeader>
      <TableRow>
        <SortableHeader label="Asset" sortKey="asset" activeSortKey={sortState.sortKey} sortDirection={sortState.sortDirection} onSort={sortState.onSort} style={{width: '9%'}} />
        <TableHead style={{width: '12%'}} className={`text-right ${HIDDEN_MOBILE}`}>Quantity</TableHead>
        <TableHead style={{width: '10%'}} className={`text-right ${HIDDEN_MOBILE}`}>Avg Cost</TableHead>
        <SortableHeader label="Total Cost" sortKey="totalCost" activeSortKey={sortState.sortKey} sortDirection={sortState.sortDirection} onSort={sortState.onSort} align="right" style={{width: '12%'}} className={HIDDEN_MOBILE} />
        <TableHead style={{width: '10%'}} className={`text-right ${HIDDEN_MOBILE}`}>Price</TableHead>
        <SortableHeader label="Value" sortKey="value" activeSortKey={sortState.sortKey} sortDirection={sortState.sortDirection} onSort={sortState.onSort} align="right" style={{width: '12%'}} />
        <SortableHeader label="P&L" sortKey="pnl" activeSortKey={sortState.sortKey} sortDirection={sortState.sortDirection} onSort={sortState.onSort} align="right" style={{width: '11%'}} />
        <SortableHeader label="Storage" sortKey="storage" activeSortKey={sortState.sortKey} sortDirection={sortState.sortDirection} onSort={sortState.onSort} align="right" style={{width: '9%'}} className={HIDDEN_MOBILE} />
        <TableHead style={{width: '15%'}} className="text-center">Actions</TableHead>
      </TableRow>
    </TableHeader>
  );

  // Table class: compact on mobile = fixed layout. Expanded = auto layout with scroll.
  const tableClass = showAllColumns
    ? 'w-full min-w-[700px]'  // auto-sized columns, scrollable
    : 'table-fixed w-full';    // fixed columns, fits viewport

  return (
    <>
      <div className="space-y-4">
        {/* Mobile column toggle */}
        <div className="flex justify-end md:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground touch-manipulation"
            onClick={() => setShowAllColumns(!showAllColumns)}
          >
            {showAllColumns ? (
              <><Columns2 className="h-3.5 w-3.5 mr-1" /> Compact</>
            ) : (
              <><Columns3 className="h-3.5 w-3.5 mr-1" /> All columns</>
            )}
          </Button>
        </div>

        {/* CEX Sub-group */}
        {cexPositions.length > 0 && (
          <Collapsible open={isExpanded(cexId)} onOpenChange={() => toggle(cexId)}>
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-2 cursor-pointer select-none group mb-2">
                <ChevronRight
                  className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
                    isExpanded(cexId) ? 'rotate-90' : ''
                  }`}
                />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide group-hover:text-foreground transition-colors">
                  CEX
                </p>
                <span className="text-xs text-muted-foreground">
                  ({cexPositions.length})
                </span>
                {!isExpanded(cexId) && (
                  <span className="text-xs font-mono text-muted-foreground ml-auto">
                    {formatCurrency(convertSub(cexTotal), currency, 0)}
                  </span>
                )}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden">
              <div className="rounded-md border overflow-x-auto">
                <Table className={tableClass}>
                  {renderTableHeader(cexSort)}
                  <TableBody>
                    {cexPositions.map(renderPositionRow)}
                  </TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Onchain Sub-group */}
        {onchainPositions.length > 0 && (
          <Collapsible open={isExpanded(onchainId)} onOpenChange={() => toggle(onchainId)}>
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-2 cursor-pointer select-none group mb-2">
                <ChevronRight
                  className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${
                    isExpanded(onchainId) ? 'rotate-90' : ''
                  }`}
                />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide group-hover:text-foreground transition-colors">
                  Onchain
                </p>
                <span className="text-xs text-muted-foreground">
                  ({onchainPositions.length})
                </span>
                {!isExpanded(onchainId) && (
                  <span className="text-xs font-mono text-muted-foreground ml-auto">
                    {formatCurrency(convertSub(onchainTotal), currency, 0)}
                  </span>
                )}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden">
              <div className="rounded-md border overflow-x-auto">
                <Table className={tableClass}>
                  {renderTableHeader(onchainSort)}
                  <TableBody>
                    {onchainPositions.map(renderPositionRow)}
                  </TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Empty state */}
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

      {/* Edit Dialog */}
      <Dialog open={!!editPosition} onOpenChange={() => setEditPosition(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Position</DialogTitle>
          </DialogHeader>
          {editPosition && (
            <PositionForm
              position={editPosition}
              onSuccess={() => setEditPosition(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletePosition} onOpenChange={() => {
        setDeletePosition(null);
        setDontAskAgain(false);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Position</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete your {deletePosition?.asset.symbol} position?
              This action cannot be undone.
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
            <label
              htmlFor="dontAskAgain"
              className="text-sm text-muted-foreground cursor-pointer"
            >
              Don't ask me again
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setDeletePosition(null);
              setDontAskAgain(false);
            }}>
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

      {/* Position Detail Dialog */}
      <Dialog open={!!viewPosition} onOpenChange={() => setViewPosition(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{viewPosition?.asset.symbol}</span>
              <span className="text-muted-foreground font-normal">
                {viewPosition?.asset.name}
              </span>
            </DialogTitle>
          </DialogHeader>
          {viewPosition && (
            <div className="space-y-4">
              {/* Key Metrics */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Quantity</p>
                  <p className="font-mono font-medium">
                    {viewPosition.asset.category === 'STABLECOIN' || viewPosition.asset.category === 'CASH'
                      ? formatNumber(viewPosition.quantity, 0)
                      : formatNumber(viewPosition.quantity, 4)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Current Price</p>
                  <p className="font-mono font-medium text-slate-500 dark:text-slate-400">
                    {formatCurrency(convert(viewPosition.asset.currentPriceUsd), currency, getSmartDecimals(convert(viewPosition.asset.currentPriceUsd)))}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Average Cost</p>
                  <p className="font-mono">
                    {formatCurrency(convert(viewPosition.avgCostUsd), currency, getSmartDecimals(convert(viewPosition.avgCostUsd)))}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Total Cost</p>
                  <p className="font-mono">
                    {formatCurrency(convert(viewPosition.quantity * viewPosition.avgCostUsd), currency, 0)}
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
                  <p className={`font-mono font-medium ${getPnLColorClass(viewPosition.unrealizedPnL)}`}>
                    {formatCurrency(convert(viewPosition.unrealizedPnL), currency, 0)}
                    <span className="text-xs ml-1">({formatPercent(viewPosition.unrealizedPnLPct)})</span>
                  </p>
                </div>
              </div>

              {/* Storage Info */}
              <div className="border-t pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Storage Type</p>
                    <p className="text-sm">
                      {STORAGE_TYPE_LABELS[viewPosition.storageType] || viewPosition.storageType}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Storage Location</p>
                    <p className="text-sm">
                      {viewPosition.storageLocation || '-'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {viewPosition.notes && (
                <div className="border-t pt-4">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-md">
                    {viewPosition.notes}
                  </p>
                </div>
              )}

              {/* Timestamps */}
              <div className="border-t pt-4 text-xs text-muted-foreground">
                <p>Created: {formatDateTime(viewPosition.createdAt)}</p>
                <p>Updated: {formatDateTime(viewPosition.updatedAt)}</p>
              </div>

              {/* Actions */}
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

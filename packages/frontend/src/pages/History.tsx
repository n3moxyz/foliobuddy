import { useState } from 'react';
import { useSnapshots, useDeleteSnapshot, useDeleteAllSnapshots } from '@/hooks/useSnapshots';
import { useCurrencyStore } from '@/stores/currencyStore';
import { usePortfolioSummary } from '@/hooks/usePortfolio';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { SnapshotForm } from '@/components/history/SnapshotForm';
import { Plus, Bot, Clock, Pencil, Trash2, History as HistoryIcon, Copy, Check, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { api, Snapshot, SnapshotPosition } from '@/lib/api';

// Format snapshots for clipboard
function formatSnapshotsForClipboard(snapshots: Snapshot[]) {
  const formatted = snapshots.map(s => ({
    timestamp: s.timestamp,
    snapshotType: s.snapshotType,
    source: s.source,
    totalValueUsd: s.totalValueUsd,
    totalCostBasis: s.totalCostBasis,
    notes: s.notes,
  }));
  return JSON.stringify(formatted, null, 2);
}

async function copySnapshotsToClipboard(snapshots: Snapshot[]): Promise<boolean> {
  try {
    const text = formatSnapshotsForClipboard(snapshots);
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type SourceFilter = 'all' | 'AUTOMATIC' | 'MANUAL';

export default function History() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingSnapshot, setEditingSnapshot] = useState<Snapshot | null>(null);
  const [deletingSnapshot, setDeletingSnapshot] = useState<Snapshot | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [copiedAll, setCopiedAll] = useState(false);

  const { currency } = useCurrencyStore();
  const { data: summary } = usePortfolioSummary();
  // Always fetch all snapshots - filter client-side for correct counts
  const { data: allSnapshots, isLoading } = useSnapshots();
  const deleteSnapshot = useDeleteSnapshot();
  const deleteAllMutation = useDeleteAllSnapshots();

  // Calculate FX rate from summary
  const fxRate = summary && summary.totalValueUsd > 0 && summary.totalValueSgd > 0
    ? summary.totalValueSgd / summary.totalValueUsd
    : 1.35;

  // Calculate counts from full data
  const automaticSnapshots = allSnapshots?.filter((s) => s.source === 'AUTOMATIC') || [];
  const manualSnapshots = allSnapshots?.filter((s) => s.source === 'MANUAL') || [];
  const totalCount = allSnapshots?.length || 0;
  const automaticCount = automaticSnapshots.length;
  const manualCount = manualSnapshots.length;

  // Get filtered snapshots based on current tab
  const filteredSnapshots = sourceFilter === 'all'
    ? allSnapshots || []
    : sourceFilter === 'AUTOMATIC'
      ? automaticSnapshots
      : manualSnapshots;

  const handleDelete = async () => {
    if (!deletingSnapshot) return;
    await deleteSnapshot.mutateAsync(deletingSnapshot.id);
    setDeletingSnapshot(null);
  };

  const displayValue = (value: number) => {
    return currency === 'SGD'
      ? formatCurrency(value * fxRate, 'SGD', 0)
      : formatCurrency(value, 'USD', 0);
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Snapshot History</h1>
          <p className="text-muted-foreground">
            View and manage portfolio snapshots
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (allSnapshots && allSnapshots.length > 0) {
                // Filter out "pending" snapshots (today's snapshots before 9pm SGT)
                const completedSnapshots = allSnapshots.filter(s => {
                  const snapshotDate = new Date(s.timestamp);
                  const today = new Date();
                  const isSnapshotToday = snapshotDate.toDateString() === today.toDateString();
                  const isBeforeSnapshotTime = today.getUTCHours() < 13; // Before 1pm UTC = 9pm SGT
                  // Exclude today's snapshots if we're before snapshot time
                  return !(isSnapshotToday && isBeforeSnapshotTime);
                });
                const success = await copySnapshotsToClipboard(completedSnapshots);
                if (success) {
                  setCopiedAll(true);
                  setTimeout(() => setCopiedAll(false), 2000);
                }
              }
            }}
            disabled={!allSnapshots || allSnapshots.length === 0}
          >
            {copiedAll ? (
              <Check className="h-4 w-4 mr-1 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 mr-1" />
            )}
            {copiedAll ? 'Copied!' : 'Copy All'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteAllConfirm(true)}
            disabled={!allSnapshots || allSnapshots.length === 0}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete All
          </Button>
          <Button size="sm" onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Snapshot
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Snapshots</CardTitle>
            <HistoryIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Automatic</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{automaticCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Manual</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{manualCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Snapshot Table with Tabs */}
      <Tabs defaultValue="all" onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
        <TabsList>
          <TabsTrigger value="all">All ({totalCount})</TabsTrigger>
          <TabsTrigger value="AUTOMATIC">Automatic ({automaticCount})</TabsTrigger>
          <TabsTrigger value="MANUAL">Manual ({manualCount})</TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <SnapshotTable
            snapshots={filteredSnapshots}
            isLoading={isLoading}
            displayValue={displayValue}
            liveValueUsd={summary?.totalValueUsd}
            onEdit={setEditingSnapshot}
            onDelete={setDeletingSnapshot}
          />
        </div>
      </Tabs>

      {/* Add Snapshot Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Historical Snapshot</DialogTitle>
            <DialogDescription>
              Manually add a portfolio snapshot for a specific date.
            </DialogDescription>
          </DialogHeader>
          <SnapshotForm
            fxRate={fxRate}
            onSuccess={() => setShowAddForm(false)}
            onCancel={() => setShowAddForm(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Snapshot Dialog */}
      <Dialog open={!!editingSnapshot} onOpenChange={(open) => !open && setEditingSnapshot(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Snapshot</DialogTitle>
            <DialogDescription>
              Update the snapshot details.
            </DialogDescription>
          </DialogHeader>
          {editingSnapshot && (
            <SnapshotForm
              snapshot={editingSnapshot}
              fxRate={fxRate}
              onSuccess={() => setEditingSnapshot(null)}
              onCancel={() => setEditingSnapshot(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingSnapshot} onOpenChange={(open) => !open && setDeletingSnapshot(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Snapshot</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this snapshot from {deletingSnapshot && formatDate(deletingSnapshot.timestamp)}?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingSnapshot(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteSnapshot.isPending}
            >
              {deleteSnapshot.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete All Confirmation Dialog */}
      <Dialog open={showDeleteAllConfirm} onOpenChange={setShowDeleteAllConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete All Snapshots</DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete all <span className="font-semibold text-foreground">{allSnapshots?.length || 0}</span> snapshots?
              This will permanently remove all your snapshot history.
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

interface SnapshotTableProps {
  snapshots: Snapshot[];
  isLoading: boolean;
  displayValue: (value: number) => string;
  liveValueUsd?: number;
  onEdit: (snapshot: Snapshot) => void;
  onDelete: (snapshot: Snapshot) => void;
}

// Format a single snapshot for clipboard (same format as bulk export)
function formatSnapshotForClipboard(snapshot: Snapshot) {
  return {
    timestamp: snapshot.timestamp,
    snapshotType: snapshot.snapshotType,
    source: snapshot.source,
    totalValueUsd: snapshot.totalValueUsd,
    totalCostBasis: snapshot.totalCostBasis,
    notes: snapshot.notes,
  };
}

async function copySnapshotToClipboard(snapshot: Snapshot): Promise<boolean> {
  try {
    const formatted = formatSnapshotForClipboard(snapshot);
    await navigator.clipboard.writeText(JSON.stringify(formatted, null, 2));
    return true;
  } catch {
    return false;
  }
}

// Helper to check if a date is today
function isToday(dateString: string): boolean {
  const date = new Date(dateString);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

// Helper to check if we're before 9pm SGT (1pm UTC)
// If before 9pm SGT, today's snapshot hasn't been taken yet
function isBeforeSnapshotTime(): boolean {
  const now = new Date();
  const utcHour = now.getUTCHours();
  return utcHour < 13; // Before 1pm UTC = Before 9pm SGT
}

function SnapshotTable({ snapshots, isLoading, displayValue, liveValueUsd, onEdit, onDelete }: SnapshotTableProps) {
  const [expandedSnapshots, setExpandedSnapshots] = useState<Set<string>>(new Set());
  const [loadingPositions, setLoadingPositions] = useState<Set<string>>(new Set());
  const [positionsCache, setPositionsCache] = useState<Record<string, SnapshotPosition[]>>({});
  const [copiedSnapshotId, setCopiedSnapshotId] = useState<string | null>(null);
  const [copiedPositionsId, setCopiedPositionsId] = useState<string | null>(null);

  // Check if there's already a snapshot for today
  const hasTodaySnapshot = snapshots.some(s => isToday(s.timestamp));
  // Show live row if: before snapshot time, no today snapshot, and we have live value
  const showLiveRow = isBeforeSnapshotTime() && !hasTodaySnapshot && liveValueUsd !== undefined;

  const toggleExpand = async (snapshotId: string) => {
    const newExpanded = new Set(expandedSnapshots);
    if (newExpanded.has(snapshotId)) {
      newExpanded.delete(snapshotId);
    } else {
      newExpanded.add(snapshotId);
      // Load positions if not cached
      if (!positionsCache[snapshotId]) {
        setLoadingPositions(prev => new Set(prev).add(snapshotId));
        try {
          const positions = await api.getSnapshotPositions(snapshotId);
          setPositionsCache(prev => ({ ...prev, [snapshotId]: positions }));
        } catch (error) {
          console.error('Failed to load positions:', error);
        } finally {
          setLoadingPositions(prev => {
            const next = new Set(prev);
            next.delete(snapshotId);
            return next;
          });
        }
      }
    }
    setExpandedSnapshots(newExpanded);
  };

  const handleCopySnapshot = async (snapshot: Snapshot) => {
    const success = await copySnapshotToClipboard(snapshot);
    if (success) {
      setCopiedSnapshotId(snapshot.id);
      setTimeout(() => setCopiedSnapshotId(null), 2000);
    }
  };

  const handleCopyPositions = async (snapshotId: string) => {
    try {
      const positions = await api.getSnapshotPositions(snapshotId);
      const formatted = positions.map(pos => ({
        asset: {
          coingeckoId: pos.asset.coingeckoId,
          symbol: pos.asset.symbol,
          name: pos.asset.name,
          category: pos.asset.category,
        },
        quantity: pos.quantity,
        avgCostUsd: pos.priceUsd,
        storageType: 'WALLET' as const,
        storageLocation: null,
        notes: null,
      }));
      await navigator.clipboard.writeText(JSON.stringify(formatted, null, 2));
      setCopiedPositionsId(snapshotId);
      setTimeout(() => setCopiedPositionsId(null), 2000);
    } catch {
      // Silently fail
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <div className="animate-pulse text-muted-foreground">Loading snapshots...</div>
        </CardContent>
      </Card>
    );
  }

  if (snapshots.length === 0 && !showLiveRow) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <p className="text-muted-foreground">No snapshots yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[5%]"></TableHead>
                <TableHead className="w-[18%]">Date</TableHead>
                <TableHead className="w-[18%] text-right">Value</TableHead>
                <TableHead className="w-[15%]">Source</TableHead>
                <TableHead className="w-[24%]">Notes</TableHead>
                <TableHead className="w-[20%] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Virtual "Today (Live)" row when no snapshot exists yet */}
              {showLiveRow && (
                <TableRow className="bg-green-50 dark:bg-green-950/20">
                  <TableCell></TableCell>
                  <TableCell className="font-medium">
                    {formatDate(new Date().toISOString())}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <div className="text-green-600 dark:text-green-400" title="Live portfolio value (snapshot at 9pm SGT)">
                      <div>{displayValue(liveValueUsd!)}</div>
                      <div className="text-xs">(Live)</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <Clock className="h-3 w-3 animate-pulse" />
                      PENDING
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    Snapshot at 9pm SGT
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs">
                      -
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {snapshots.map((snapshot) => {
                const isExpanded = expandedSnapshots.has(snapshot.id);
                const isLoadingPos = loadingPositions.has(snapshot.id);
                const positions = positionsCache[snapshot.id];
                const isCopied = copiedSnapshotId === snapshot.id;

                return (
                  <>
                    <TableRow key={snapshot.id}>
                      <TableCell className="px-2">
                        {snapshot.source === 'AUTOMATIC' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => toggleExpand(snapshot.id)}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatDate(snapshot.timestamp)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {snapshot.totalValueUsd === 0 && snapshot.source === 'AUTOMATIC' ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex items-center justify-end gap-1 text-amber-600 dark:text-amber-400">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  {displayValue(snapshot.totalValueUsd)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">Snapshot captured $0 - positions may have been empty</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : displayValue(snapshot.totalValueUsd)}
                      </TableCell>
                      <TableCell>
                        <span className={`flex items-center gap-1 text-xs ${
                          snapshot.source === 'AUTOMATIC'
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-orange-600 dark:text-orange-400'
                        }`}>
                          {snapshot.source === 'AUTOMATIC' ? (
                            <Bot className="h-3 w-3" />
                          ) : (
                            <Clock className="h-3 w-3" />
                          )}
                          {snapshot.source}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {snapshot.notes || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleCopySnapshot(snapshot)}
                                >
                                  {isCopied ? (
                                    <Check className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">{isCopied ? 'Copied!' : 'Copy for import'}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => onEdit(snapshot)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => onDelete(snapshot)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {/* Expanded positions row */}
                    {isExpanded && (
                      <TableRow key={`${snapshot.id}-positions`}>
                        <TableCell colSpan={6} className="bg-muted/30 p-0">
                          <div className="p-4">
                            {isLoadingPos ? (
                              <div className="text-center py-4 text-muted-foreground text-sm">
                                Loading positions...
                              </div>
                            ) : positions && positions.length > 0 ? (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-medium">
                                    Positions ({positions.length})
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCopyPositions(snapshot.id)}
                                  >
                                    {copiedPositionsId === snapshot.id ? (
                                      <Check className="h-3 w-3 mr-1 text-green-500" />
                                    ) : (
                                      <Copy className="h-3 w-3 mr-1" />
                                    )}
                                    {copiedPositionsId === snapshot.id ? 'Copied!' : 'Copy Positions'}
                                  </Button>
                                </div>
                                <div className="rounded border bg-background">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>Asset</TableHead>
                                        <TableHead className="text-right">Quantity</TableHead>
                                        <TableHead className="text-right">Price</TableHead>
                                        <TableHead className="text-right">Value</TableHead>
                                        <TableHead className="text-right">Allocation</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {positions.map((pos) => (
                                        <TableRow key={pos.id}>
                                          <TableCell className="font-medium">
                                            {pos.assetSymbol}
                                          </TableCell>
                                          <TableCell className="text-right font-mono">
                                            {pos.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                                          </TableCell>
                                          <TableCell className="text-right font-mono">
                                            ${pos.priceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </TableCell>
                                          <TableCell className="text-right font-mono">
                                            ${pos.valueUsd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                          </TableCell>
                                          <TableCell className="text-right font-mono">
                                            {pos.allocation.toFixed(2)}%
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center py-4 text-muted-foreground text-sm">
                                No positions recorded for this snapshot
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

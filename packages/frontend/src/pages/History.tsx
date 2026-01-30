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
import { Plus, Bot, Clock, Pencil, Trash2, History as HistoryIcon, Copy, Check, AlertTriangle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Snapshot } from '@/lib/api';

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
                const success = await copySnapshotsToClipboard(allSnapshots);
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
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <div className="animate-pulse text-muted-foreground">Loading snapshots...</div>
        </CardContent>
      </Card>
    );
  }

  if (snapshots.length === 0) {
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
                <TableHead className="w-[20%]">Date</TableHead>
                <TableHead className="w-[20%] text-right">Value</TableHead>
                <TableHead className="w-[20%]">Source</TableHead>
                <TableHead className="w-[25%]">Notes</TableHead>
                <TableHead className="w-[15%] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshots.map((snapshot) => (
                <TableRow key={snapshot.id}>
                  <TableCell className="font-medium">
                    {formatDate(snapshot.timestamp)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {/* Show live value if today AND before 9pm SGT (snapshot not taken yet) */}
                    {isToday(snapshot.timestamp) && isBeforeSnapshotTime() && liveValueUsd ? (
                      <div className="text-green-600 dark:text-green-400" title="Live portfolio value (snapshot at 9pm SGT)">
                        <div>{displayValue(liveValueUsd)}</div>
                        <div className="text-xs">(Live)</div>
                      </div>
                    ) : snapshot.totalValueUsd === 0 && snapshot.source === 'AUTOMATIC' ? (
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
                    ) : (
                      displayValue(snapshot.totalValueUsd)
                    )}
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
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

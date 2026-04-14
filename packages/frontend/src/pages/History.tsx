import { useState } from 'react';
import { useSnapshots, useDeleteSnapshot, useDeleteAllSnapshots } from '@/hooks/useSnapshots';
import { useCurrencyStore } from '@/stores/currencyStore';
import { usePortfolioSummary } from '@/hooks/usePortfolio';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { SnapshotForm } from '@/components/history/SnapshotForm';
import { SnapshotTable } from '@/components/history/SnapshotTable';
import { Plus, Trash2, Copy, Check, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Snapshot } from '@/lib/types';

// Format snapshots for clipboard
function formatSnapshotsForClipboard(snapshots: Snapshot[]) {
  const formatted = snapshots.map((s) => ({
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
  const fxRate =
    summary && summary.totalValueUsd > 0 && summary.totalValueSgd > 0
      ? summary.totalValueSgd / summary.totalValueUsd
      : 1.35;

  // Calculate counts from full data
  const automaticSnapshots = allSnapshots?.filter((s) => s.source === 'AUTOMATIC') || [];
  const manualSnapshots = allSnapshots?.filter((s) => s.source === 'MANUAL') || [];
  const totalCount = allSnapshots?.length || 0;
  const automaticCount = automaticSnapshots.length;
  const manualCount = manualSnapshots.length;

  // Get filtered snapshots based on current tab
  const filteredSnapshots =
    sourceFilter === 'all'
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
      <div className="animate-fade-in-up flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Snapshot History</h1>
          <p className="text-sm text-muted-foreground">Track your portfolio value over time</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={async () => {
              if (allSnapshots && allSnapshots.length > 0) {
                const completedSnapshots = allSnapshots.filter((s) => {
                  const snapshotDate = new Date(s.timestamp);
                  const today = new Date();
                  const isSnapshotToday = snapshotDate.toDateString() === today.toDateString();
                  const isBeforeSnapshotTime = today.getUTCHours() < 13;
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
          <Button size="sm" className="touch-manipulation" onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Snapshot
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
                onClick={async () => {
                  if (allSnapshots && allSnapshots.length > 0) {
                    const completedSnapshots = allSnapshots.filter((s) => {
                      const snapshotDate = new Date(s.timestamp);
                      const today = new Date();
                      const isSnapshotToday = snapshotDate.toDateString() === today.toDateString();
                      const isBeforeSnapshotTime = today.getUTCHours() < 13;
                      return !(isSnapshotToday && isBeforeSnapshotTime);
                    });
                    await copySnapshotsToClipboard(completedSnapshots);
                    setCopiedAll(true);
                    setTimeout(() => setCopiedAll(false), 2000);
                  }
                }}
                disabled={!allSnapshots || allSnapshots.length === 0}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy All
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setShowDeleteAllConfirm(true)}
                disabled={!allSnapshots || allSnapshots.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete All
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-baseline gap-6 flex-wrap py-4 border-b">
        <div>
          <p className="text-sm text-muted-foreground mb-0.5">Total</p>
          <p className="text-lg font-semibold tabular-nums">{totalCount}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-0.5">Automatic</p>
          <p className="text-lg font-semibold tabular-nums">{automaticCount}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-0.5">Manual</p>
          <p className="text-lg font-semibold tabular-nums">{manualCount}</p>
        </div>
      </div>

      {/* Snapshot Table with Tabs */}
      <Tabs
        defaultValue="all"
        onValueChange={(v) => setSourceFilter(v as SourceFilter)}
      >
        <TabsList className="sm:w-auto">
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
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] overflow-y-auto">
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
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Snapshot</DialogTitle>
            <DialogDescription>Update the snapshot details.</DialogDescription>
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
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Snapshot</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this snapshot from{' '}
              <span className="font-semibold text-foreground">
                {deletingSnapshot && formatDate(deletingSnapshot.timestamp)}
              </span>
              ?
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeletingSnapshot(null)}
                disabled={deleteSnapshot.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleteSnapshot.isPending}
              >
                {deleteSnapshot.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete All Confirmation Dialog */}
      <Dialog open={showDeleteAllConfirm} onOpenChange={setShowDeleteAllConfirm}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete All Snapshots</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete all{' '}
              <span className="font-semibold text-foreground">{allSnapshots?.length || 0}</span>{' '}
              snapshots? This will permanently remove all your snapshot history.
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

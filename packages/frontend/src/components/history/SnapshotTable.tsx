import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDate } from '@/lib/utils';
import { api } from '@/lib/api';
import type { Snapshot, SnapshotPosition } from '@/lib/types';
import {
  Bot,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Pencil,
  Trash2,
} from 'lucide-react';

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

export function SnapshotTable({
  snapshots,
  isLoading,
  displayValue,
  liveValueUsd,
  onEdit,
  onDelete,
}: SnapshotTableProps) {
  const [expandedSnapshots, setExpandedSnapshots] = useState<Set<string>>(new Set());
  const [loadingPositions, setLoadingPositions] = useState<Set<string>>(new Set());
  const [positionsCache, setPositionsCache] = useState<Record<string, SnapshotPosition[]>>({});
  const [copiedSnapshotId, setCopiedSnapshotId] = useState<string | null>(null);
  const [copiedPositionsId, setCopiedPositionsId] = useState<string | null>(null);

  // Check if there's already a snapshot for today
  const hasTodaySnapshot = snapshots.some((s) => isToday(s.timestamp));
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
        setLoadingPositions((prev) => new Set(prev).add(snapshotId));
        try {
          const positions = await api.getSnapshotPositions(snapshotId);
          setPositionsCache((prev) => ({ ...prev, [snapshotId]: positions }));
        } catch (error) {
          console.error('Failed to load positions:', error);
        } finally {
          setLoadingPositions((prev) => {
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
      const formatted = positions.map((pos) => ({
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
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="hidden sm:table-cell">Source</TableHead>
                <TableHead className="hidden md:table-cell">Notes</TableHead>
                <TableHead className="text-center">Actions</TableHead>
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
                    <div
                      className="text-green-600 dark:text-green-400"
                      title="Live portfolio value (snapshot at 9pm SGT)"
                    >
                      <div>{displayValue(liveValueUsd!)}</div>
                      <div className="text-xs">(Live)</div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <Clock className="h-3 w-3 animate-pulse" />
                      PENDING
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
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
                            aria-label={isExpanded ? 'Collapse positions' : 'Expand positions'}
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
                                <p className="text-xs">
                                  Snapshot captured $0 - positions may have been empty
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          displayValue(snapshot.totalValueUsd)
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span
                          className={`flex items-center gap-1 text-xs ${
                            snapshot.source === 'AUTOMATIC'
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-orange-600 dark:text-orange-400'
                          }`}
                        >
                          {snapshot.source === 'AUTOMATIC' ? (
                            <Bot className="h-3 w-3" />
                          ) : (
                            <Clock className="h-3 w-3" />
                          )}
                          {snapshot.source}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell max-w-[150px] truncate">
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
                                  className="h-8 w-8 touch-manipulation"
                                  onClick={() => handleCopySnapshot(snapshot)}
                                  aria-label="Copy snapshot"
                                >
                                  {isCopied ? (
                                    <Check className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">
                                  {isCopied ? 'Copied!' : 'Copy for import'}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 touch-manipulation"
                            onClick={() => onEdit(snapshot)}
                            aria-label="Edit snapshot"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => onDelete(snapshot)}
                            aria-label="Delete snapshot"
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
                                    {copiedPositionsId === snapshot.id
                                      ? 'Copied!'
                                      : 'Copy Positions'}
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
                                            {pos.quantity.toLocaleString(undefined, {
                                              maximumFractionDigits: 6,
                                            })}
                                          </TableCell>
                                          <TableCell className="text-right font-mono">
                                            $
                                            {pos.priceUsd.toLocaleString(undefined, {
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2,
                                            })}
                                          </TableCell>
                                          <TableCell className="text-right font-mono">
                                            $
                                            {pos.valueUsd.toLocaleString(undefined, {
                                              minimumFractionDigits: 0,
                                              maximumFractionDigits: 0,
                                            })}
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

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreateInvestorData, Investor } from '@/lib/types';
import { formatCurrency, formatPercent, getPnLColorClass } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, Trash2, Crown, Users as UsersIcon } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpTooltip } from '@/components/ui/HelpTooltip';

// Helper to format stake percentage with up to 5 decimal places (trimming trailing zeros)
function formatStakePercentage(value: number): string {
  // Format with 5 decimals, then trim trailing zeros
  const formatted = value.toFixed(5);
  return formatted.replace(/\.?0+$/, '') || '0';
}

export default function Investors() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editInvestor, setEditInvestor] = useState<Investor | null>(null);
  const [deleteInvestor, setDeleteInvestor] = useState<Investor | null>(null);
  const [reassignToId, setReassignToId] = useState<string>('');

  const queryClient = useQueryClient();

  const { data: investors, isLoading } = useQuery({
    queryKey: ['investors'],
    queryFn: api.getInvestors,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateInvestorData) => api.createInvestor(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investors'] });
      setShowAddForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateInvestorData> }) =>
      api.updateInvestor(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investors'] });
      setEditInvestor(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, reassignTo }: { id: string; reassignTo?: string }) =>
      api.deleteInvestor(id, reassignTo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investors'] });
      setDeleteInvestor(null);
      setReassignToId('');
    },
  });

  const totalStake = investors?.reduce((sum, inv) => sum + inv.stakePercentage, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="animate-fade-in-up flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Investors</h1>
          <p className="text-sm text-muted-foreground">
            Manage investor stakes and track their returns
          </p>
        </div>
        <Button size="sm" className="touch-manipulation" onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Investor
        </Button>
      </div>

      {/* Summary */}
      <div className="flex items-baseline gap-6 flex-wrap py-4 border-b">
        <div>
          <p className="text-sm text-muted-foreground mb-0.5">
            Total Investors
            <HelpTooltip content="Number of investors with portfolio stakes" />
          </p>
          <p className="text-lg font-semibold tabular-nums">{investors?.length || 0}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-0.5">
            Allocated Stake
            <HelpTooltip content="Total percentage of portfolio allocated to investors" />
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {formatStakePercentage(totalStake)}%
            <span className="text-sm font-normal text-muted-foreground ml-1.5">
              ({formatStakePercentage(100 - totalStake)}% available)
            </span>
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-0.5">
            Total Current Value
            <HelpTooltip content="Combined current value of all investor stakes" />
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {formatCurrency(
              investors?.reduce((sum, inv) => sum + (inv.currentValue || 0), 0) || 0,
              'USD',
              0
            )}
          </p>
        </div>
      </div>

      {/* Investors Table */}
      <Card>
        <CardHeader>
          <CardTitle>Investor List</CardTitle>
          <CardDescription>All investors and their current values</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <div className="flex gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-20" />
                ))}
              </div>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : investors && investors.length > 0 ? (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Stake %</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">
                      Capital (1 Jan)
                    </TableHead>
                    <TableHead className="hidden sm:table-cell text-right">Current Value</TableHead>
                    <TableHead className="text-right">YTD Return</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investors.map((investor) => (
                    <TableRow key={investor.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {investor.name}
                          {investor.isOwner && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-1.5 py-0.5 rounded">
                              <Crown className="h-3 w-3" />
                              Owner
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatStakePercentage(investor.stakePercentage)}%
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-right font-mono">
                        {investor.capitalAtYearStart
                          ? formatCurrency(investor.capitalAtYearStart, 'USD', 0)
                          : '-'}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-right font-mono">
                        {formatCurrency(investor.currentValue, 'USD', 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {investor.ytdReturn !== null ? (
                          <div className={getPnLColorClass(investor.ytdReturn)}>
                            <p className="font-mono">
                              {formatCurrency(investor.ytdReturn, 'USD', 0)}
                            </p>
                            <p className="text-xs">{formatPercent(investor.ytdReturnPct)}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 touch-manipulation"
                            onClick={() => setEditInvestor(investor)}
                            aria-label="Edit investor"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive touch-manipulation"
                            onClick={() => setDeleteInvestor(investor)}
                            aria-label="Delete investor"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-16 text-center">
              <UsersIcon className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-1">No investors yet</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                Add investors to track their stakes, capital contributions, and YTD returns.
              </p>
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add Investor
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Investor Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Investor</DialogTitle>
            {totalStake >= 100 && (
              <DialogDescription>
                Total stake is currently {formatStakePercentage(totalStake)}%. You may need to
                rebalance existing investors after adding.
              </DialogDescription>
            )}
          </DialogHeader>
          <InvestorForm
            onSubmit={(data) => createMutation.mutate(data)}
            isLoading={createMutation.isPending}
            currentTotalStake={totalStake}
            allInvestors={investors || []}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Investor Dialog */}
      <Dialog open={!!editInvestor} onOpenChange={() => setEditInvestor(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Investor</DialogTitle>
          </DialogHeader>
          {editInvestor && (
            <InvestorForm
              onSubmit={(data) => updateMutation.mutate({ id: editInvestor.id, data })}
              isLoading={updateMutation.isPending}
              initialData={editInvestor}
              currentTotalStake={totalStake}
              allInvestors={investors || []}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteInvestor}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteInvestor(null);
            setReassignToId('');
          }
        }}
      >
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Investor</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to remove{' '}
              <span className="font-semibold text-foreground">{deleteInvestor?.name}</span> from the
              investor list? Historical data will not be affected.
            </p>

            {/* Stake reassignment - only show if there are other investors */}
            {deleteInvestor && investors && investors.length > 1 && (
              <div className="space-y-2">
                <Label>
                  Reassign {formatStakePercentage(deleteInvestor.stakePercentage)}% stake to:
                </Label>
                {investors.length === 2 ? (
                  <p className="text-sm text-muted-foreground">
                    Stake will be reassigned to{' '}
                    <span className="font-medium">
                      {investors.find((inv) => inv.id !== deleteInvestor.id)?.name}
                    </span>
                  </p>
                ) : (
                  <Select value={reassignToId} onValueChange={setReassignToId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an investor" />
                    </SelectTrigger>
                    <SelectContent>
                      {investors
                        .filter((inv) => inv.id !== deleteInvestor.id)
                        .map((inv) => (
                          <SelectItem key={inv.id} value={inv.id}>
                            {inv.name} ({formatStakePercentage(inv.stakePercentage)}%)
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDeleteInvestor(null);
                  setReassignToId('');
                }}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (!deleteInvestor) return;
                  let reassignTo: string | undefined;
                  if (investors && investors.length > 1) {
                    if (investors.length === 2) {
                      reassignTo = investors.find((inv) => inv.id !== deleteInvestor.id)?.id;
                    } else {
                      reassignTo = reassignToId || undefined;
                    }
                  }
                  deleteMutation.mutate({ id: deleteInvestor.id, reassignTo });
                }}
                disabled={
                  deleteMutation.isPending || (investors && investors.length > 2 && !reassignToId)
                }
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InvestorForm({
  onSubmit,
  isLoading,
  initialData,
  currentTotalStake = 0,
  allInvestors = [],
}: {
  onSubmit: (data: CreateInvestorData) => void;
  isLoading: boolean;
  initialData?: Investor;
  currentTotalStake?: number;
  allInvestors?: Investor[];
}) {
  const [name, setName] = useState(initialData?.name || '');
  const [stakePercentage, setStakePercentage] = useState(
    initialData ? formatStakePercentage(initialData.stakePercentage) : ''
  );
  const [initialCapital, setInitialCapital] = useState(
    initialData?.initialCapital ? initialData.initialCapital.toString() : ''
  );
  const [isOwner, setIsOwner] = useState(initialData?.isOwner || false);

  const isEditing = !!initialData;
  const stakeValue = parseFloat(stakePercentage) || 0;
  const projectedTotal = isEditing
    ? currentTotalStake - (initialData?.stakePercentage || 0) + stakeValue
    : currentTotalStake + stakeValue;
  const exceedsTotal = projectedTotal > 100;

  // Calculate suggested stake for owner (100% - sum of other investors)
  const otherInvestorsStake = allInvestors
    .filter((inv) => inv.id !== initialData?.id)
    .reduce((sum, inv) => sum + inv.stakePercentage, 0);
  const suggestedStake = Math.max(0, 100 - otherInvestorsStake);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing) {
      // Edit mode: send the stake percentage
      onSubmit({
        name,
        stakePercentage: parseFloat(stakePercentage),
        initialCapital: initialCapital ? parseFloat(initialCapital) : undefined,
        isOwner,
      });
    } else {
      // Add mode: don't send stake percentage, let backend auto-calculate
      onSubmit({
        name,
        initialCapital: initialCapital ? parseFloat(initialCapital) : undefined,
        isOwner,
      });
    }
  };

  const handleUseSuggested = () => {
    setStakePercentage(formatStakePercentage(suggestedStake));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Investor name"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="stake">Stake Percentage</Label>
        {isEditing ? (
          // Edit mode: allow changing stake
          <>
            <Input
              id="stake"
              type="number"
              step="0.00001"
              min="0"
              max="100"
              value={stakePercentage}
              onChange={(e) => setStakePercentage(e.target.value)}
              placeholder="0 - 100"
              required
            />
            {isOwner && suggestedStake !== stakeValue && (
              <p className="text-xs text-muted-foreground">
                Suggested (balancing): {formatStakePercentage(suggestedStake)}% —{' '}
                <button
                  type="button"
                  onClick={handleUseSuggested}
                  className="text-red-500 hover:text-red-600 hover:underline"
                >
                  Use this
                </button>
              </p>
            )}
            {exceedsTotal && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Total will be {formatStakePercentage(projectedTotal)}% - rebalancing needed
              </p>
            )}
          </>
        ) : (
          // Add mode: show auto-calculated stake as read-only
          <>
            <div className="flex items-center h-10 px-3 rounded-md border bg-muted font-mono">
              {formatStakePercentage(suggestedStake)}%
            </div>
            <p className="text-xs text-muted-foreground">Automatically assigned remaining stake</p>
          </>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="capital">Capital at Start of Year (USD)</Label>
        <Input
          id="capital"
          type="number"
          step="0.01"
          min="0"
          value={initialCapital}
          onChange={(e) => setInitialCapital(e.target.value)}
          placeholder="Optional"
        />
        <p className="text-xs text-muted-foreground">Used to calculate YTD returns</p>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="isOwner"
          checked={isOwner}
          onCheckedChange={(checked) => setIsOwner(checked === true)}
        />
        <Label htmlFor="isOwner" className="text-sm cursor-pointer">
          Primary owner (stake auto-suggests as balancing figure)
        </Label>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={isLoading || !name || (isEditing && !stakePercentage)}>
          {isLoading
            ? isEditing
              ? 'Saving...'
              : 'Adding...'
            : isEditing
              ? 'Save Changes'
              : 'Add Investor'}
        </Button>
      </div>
    </form>
  );
}

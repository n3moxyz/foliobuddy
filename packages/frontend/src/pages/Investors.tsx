import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Investor, CreateInvestorData } from '@/lib/api';
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
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';

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
    mutationFn: (id: string) => api.deleteInvestor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investors'] });
      setDeleteInvestor(null);
    },
  });

  const totalStake = investors?.reduce((sum, inv) => sum + inv.stakePercentage, 0) || 0;

  // Calculate max stake for editing (current total minus the investor being edited)
  const getMaxStakeForEdit = (investor: Investor) => {
    const otherStakes = (investors || [])
      .filter(inv => inv.id !== investor.id)
      .reduce((sum, inv) => sum + inv.stakePercentage, 0);
    return 100 - otherStakes;
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Investors</h1>
          <p className="text-muted-foreground">
            Manage investor stakes and track their returns
          </p>
        </div>
        <Button onClick={() => setShowAddForm(true)} disabled={totalStake >= 100}>
          <Plus className="h-4 w-4 mr-2" />
          Add Investor
        </Button>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Investors</CardDescription>
            <CardTitle className="text-2xl">{investors?.length || 0}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Allocated Stake</CardDescription>
            <CardTitle className="text-2xl">{formatStakePercentage(totalStake)}%</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {formatStakePercentage(100 - totalStake)}% available
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Current Value</CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(
                investors?.reduce((sum, inv) => sum + (inv.currentValue || 0), 0) || 0,
                'USD',
                0
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Investors Table */}
      <Card>
        <CardHeader>
          <CardTitle>Investor List</CardTitle>
          <CardDescription>
            All investors and their current values
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-pulse text-muted-foreground">Loading investors...</div>
            </div>
          ) : investors && investors.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Stake %</TableHead>
                    <TableHead className="text-right">Capital (1 Jan)</TableHead>
                    <TableHead className="text-right">Current Value</TableHead>
                    <TableHead className="text-right">YTD Return</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investors.map((investor) => (
                    <TableRow key={investor.id}>
                      <TableCell className="font-medium">{investor.name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatStakePercentage(investor.stakePercentage)}%
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {investor.capitalAtYearStart ? formatCurrency(investor.capitalAtYearStart, 'USD', 0) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(investor.currentValue, 'USD', 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {investor.ytdReturn !== null ? (
                          <div className={getPnLColorClass(investor.ytdReturn)}>
                            <p className="font-mono">
                              {formatCurrency(investor.ytdReturn, 'USD', 0)}
                            </p>
                            <p className="text-xs">
                              {formatPercent(investor.ytdReturnPct)}
                            </p>
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
                            className="h-8 w-8"
                            onClick={() => setEditInvestor(investor)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setDeleteInvestor(investor)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No investors yet</p>
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add your first investor
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Investor Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Investor</DialogTitle>
          </DialogHeader>
          <InvestorForm
            maxStake={100 - totalStake}
            onSubmit={(data) => createMutation.mutate(data)}
            isLoading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Investor Dialog */}
      <Dialog open={!!editInvestor} onOpenChange={() => setEditInvestor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Investor</DialogTitle>
          </DialogHeader>
          {editInvestor && (
            <InvestorForm
              maxStake={getMaxStakeForEdit(editInvestor)}
              onSubmit={(data) => updateMutation.mutate({ id: editInvestor.id, data })}
              isLoading={updateMutation.isPending}
              initialData={editInvestor}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteInvestor} onOpenChange={() => setDeleteInvestor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Investor</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {deleteInvestor?.name} from the investor list?
              This will not affect historical data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteInvestor(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteInvestor && deleteMutation.mutate(deleteInvestor.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InvestorForm({
  maxStake,
  onSubmit,
  isLoading,
  initialData,
}: {
  maxStake: number;
  onSubmit: (data: CreateInvestorData) => void;
  isLoading: boolean;
  initialData?: Investor;
}) {
  const [name, setName] = useState(initialData?.name || '');
  const [stakePercentage, setStakePercentage] = useState(
    initialData ? formatStakePercentage(initialData.stakePercentage) : ''
  );
  const [initialCapital, setInitialCapital] = useState(
    initialData?.initialCapital ? initialData.initialCapital.toString() : ''
  );

  const isEditing = !!initialData;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      stakePercentage: parseFloat(stakePercentage),
      initialCapital: initialCapital ? parseFloat(initialCapital) : undefined,
    });
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
        <Input
          id="stake"
          type="number"
          step="0.00001"
          min="0"
          max={maxStake}
          value={stakePercentage}
          onChange={(e) => setStakePercentage(e.target.value)}
          placeholder={`0 - ${formatStakePercentage(maxStake)}`}
          required
        />
        <p className="text-xs text-muted-foreground">
          Maximum available: {formatStakePercentage(maxStake)}%
        </p>
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
        <p className="text-xs text-muted-foreground">
          Used to calculate YTD returns
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={isLoading || !name || !stakePercentage}>
          {isLoading ? (isEditing ? 'Saving...' : 'Adding...') : (isEditing ? 'Save Changes' : 'Add Investor')}
        </Button>
      </div>
    </form>
  );
}

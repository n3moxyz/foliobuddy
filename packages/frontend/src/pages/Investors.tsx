import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Investor, CreateInvestorData } from '@/lib/api';
import { formatCurrency, formatPercent, formatDate, getPnLColorClass } from '@/lib/utils';
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
import { Plus, Trash2 } from 'lucide-react';

export default function Investors() {
  const [showAddForm, setShowAddForm] = useState(false);
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteInvestor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investors'] });
      setDeleteInvestor(null);
    },
  });

  const totalStake = investors?.reduce((sum, inv) => sum + inv.stakePercentage, 0) || 0;

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
            <CardTitle className="text-2xl">{totalStake.toFixed(2)}%</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {(100 - totalStake).toFixed(2)}% available
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Capital</CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(
                investors?.reduce((sum, inv) => sum + inv.initialCapital, 0) || 0,
                'USD'
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
                    <TableHead className="text-right">Initial Capital</TableHead>
                    <TableHead className="text-right">Current Value</TableHead>
                    <TableHead className="text-right">Return</TableHead>
                    <TableHead>Join Date</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investors.map((investor) => (
                    <TableRow key={investor.id}>
                      <TableCell className="font-medium">{investor.name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {investor.stakePercentage.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(investor.initialCapital, 'USD')}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(investor.currentValue, 'USD')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className={getPnLColorClass(investor.totalReturn)}>
                          <p className="font-mono">
                            {formatCurrency(investor.totalReturn, 'USD')}
                          </p>
                          <p className="text-xs">
                            {formatPercent(investor.totalReturnPct)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(investor.joinDate)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteInvestor(investor)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
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
}: {
  maxStake: number;
  onSubmit: (data: CreateInvestorData) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState('');
  const [stakePercentage, setStakePercentage] = useState('');
  const [initialCapital, setInitialCapital] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      stakePercentage: parseFloat(stakePercentage),
      initialCapital: parseFloat(initialCapital) || 0,
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
          step="0.01"
          min="0"
          max={maxStake}
          value={stakePercentage}
          onChange={(e) => setStakePercentage(e.target.value)}
          placeholder={`0 - ${maxStake.toFixed(2)}`}
          required
        />
        <p className="text-xs text-muted-foreground">
          Maximum available: {maxStake.toFixed(2)}%
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="capital">Initial Capital (USD)</Label>
        <Input
          id="capital"
          type="number"
          step="0.01"
          min="0"
          value={initialCapital}
          onChange={(e) => setInitialCapital(e.target.value)}
          placeholder="0.00"
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={isLoading || !name || !stakePercentage}>
          {isLoading ? 'Adding...' : 'Add Investor'}
        </Button>
      </div>
    </form>
  );
}

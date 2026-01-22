import { useState } from 'react';
import { usePositions, usePortfolioSummary } from '@/hooks/usePortfolio';
import { useCurrencyStore } from '@/stores/currencyStore';
import { formatCurrency, formatPercent, getPnLColorClass } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PositionTable } from '@/components/portfolio/PositionTable';
import { PositionForm } from '@/components/portfolio/PositionForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';

export default function Portfolio() {
  const { currency } = useCurrencyStore();
  const { data: positions, isLoading: positionsLoading } = usePositions();
  const { data: summary } = usePortfolioSummary();
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Portfolio</h1>
          <p className="text-muted-foreground">
            Manage your positions and holdings
          </p>
        </div>
        <Button onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Position
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Value</CardDescription>
              <CardTitle className="text-xl">
                {formatCurrency(
                  currency === 'USD' ? summary.totalValueUsd : summary.totalValueSgd,
                  currency
                )}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Cost Basis</CardDescription>
              <CardTitle className="text-xl">
                {formatCurrency(summary.totalCostBasis, 'USD')}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Unrealized P&L</CardDescription>
              <CardTitle className={`text-xl ${getPnLColorClass(summary.unrealizedPnL)}`}>
                {formatCurrency(summary.unrealizedPnL, 'USD')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-sm ${getPnLColorClass(summary.unrealizedPnLPct)}`}>
                {formatPercent(summary.unrealizedPnLPct)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Positions</CardDescription>
              <CardTitle className="text-xl">{summary.positionCount}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Positions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Positions</CardTitle>
          <CardDescription>
            All your current holdings sorted by market value
          </CardDescription>
        </CardHeader>
        <CardContent>
          {positionsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-pulse text-muted-foreground">Loading positions...</div>
            </div>
          ) : positions && positions.length > 0 ? (
            <PositionTable positions={positions} />
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No positions yet</p>
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add your first position
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Position Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Position</DialogTitle>
          </DialogHeader>
          <PositionForm onSuccess={() => setShowAddForm(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

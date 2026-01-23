import { useState, useMemo } from 'react';
import { usePositions, usePortfolioSummary } from '@/hooks/usePortfolio';
import { useCurrencyStore } from '@/stores/currencyStore';
import { formatCurrency, formatPercent, getPnLColorClass } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

  // Calculate FX rate from summary
  const fxRate = useMemo(() => {
    if (summary && summary.totalValueUsd > 0 && summary.totalValueSgd > 0) {
      return summary.totalValueSgd / summary.totalValueUsd;
    }
    return 1.35; // Default fallback rate
  }, [summary]);

  // Helper to convert values based on currency
  const convertValue = (usdValue: number | null | undefined) => {
    if (usdValue === null || usdValue === undefined) return usdValue;
    return currency === 'SGD' ? usdValue * fxRate : usdValue;
  };

  // Split positions by category and calculate totals
  const { cryptoPositions, stablesPositions, cryptoTotal, stablesTotal } = useMemo(() => {
    if (!positions) return { cryptoPositions: [], stablesPositions: [], cryptoTotal: 0, stablesTotal: 0 };

    const crypto = positions.filter(p =>
      p.asset.category !== 'STABLECOIN' && p.asset.category !== 'CASH'
    );
    const stables = positions.filter(p =>
      p.asset.category === 'STABLECOIN' || p.asset.category === 'CASH'
    );

    const cryptoVal = crypto.reduce((sum, p) => sum + (p.marketValueUsd || 0), 0);
    const stablesVal = stables.reduce((sum, p) => sum + (p.marketValueUsd || 0), 0);

    return {
      cryptoPositions: crypto,
      stablesPositions: stables,
      cryptoTotal: cryptoVal,
      stablesTotal: stablesVal
    };
  }, [positions]);

  return (
    <div className="space-y-3">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Portfolio</h1>
          <p className="text-sm text-muted-foreground">
            Manage your positions and holdings
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Position
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-2 md:grid-cols-4">
          <Card className="py-2">
            <CardHeader className="py-2 px-4">
              <p className="text-xs text-muted-foreground">Total Value</p>
              <CardTitle className="text-lg">
                {formatCurrency(convertValue(summary.totalValueUsd), currency)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="py-2">
            <CardHeader className="py-2 px-4">
              <p className="text-xs text-muted-foreground">Cost Basis</p>
              <CardTitle className="text-lg">
                {formatCurrency(convertValue(summary.totalCostBasis), currency)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="py-2">
            <CardHeader className="py-2 px-4">
              <p className="text-xs text-muted-foreground">Unrealized P&L</p>
              <CardTitle className={`text-lg ${getPnLColorClass(summary.unrealizedPnL)}`}>
                {formatCurrency(convertValue(summary.unrealizedPnL), currency)}
                <span className="text-sm ml-1">({formatPercent(summary.unrealizedPnLPct)})</span>
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="py-2">
            <CardHeader className="py-2 px-4">
              <p className="text-xs text-muted-foreground">Positions</p>
              <CardTitle className="text-lg">{summary.positionCount}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Loading State */}
      {positionsLoading && (
        <div className="flex items-center justify-center h-20">
          <div className="animate-pulse text-muted-foreground text-sm">Loading positions...</div>
        </div>
      )}

      {/* Empty State */}
      {!positionsLoading && (!positions || positions.length === 0) && (
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <p className="text-muted-foreground mb-3 text-sm">No positions yet</p>
              <Button size="sm" onClick={() => setShowAddForm(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add your first position
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Crypto Positions Table */}
      {!positionsLoading && cryptoPositions.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Crypto</CardTitle>
              <span className="text-sm font-semibold text-muted-foreground">
                {formatCurrency(convertValue(cryptoTotal), currency)}
              </span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <PositionTable positions={cryptoPositions} currency={currency} fxRate={fxRate} />
          </CardContent>
        </Card>
      )}

      {/* Stables Positions Table */}
      {!positionsLoading && stablesPositions.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Stables</CardTitle>
              <span className="text-sm font-semibold text-muted-foreground">
                {formatCurrency(convertValue(stablesTotal), currency)}
              </span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <PositionTable positions={stablesPositions} currency={currency} fxRate={fxRate} />
          </CardContent>
        </Card>
      )}

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

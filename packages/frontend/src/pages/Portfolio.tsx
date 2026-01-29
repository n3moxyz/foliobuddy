import { useState, useMemo } from 'react';
import { usePositions, usePortfolioSummary, useDeleteAllPositions } from '@/hooks/usePortfolio';
import { useCurrencyStore } from '@/stores/currencyStore';
import { formatCurrency, formatPercent, getPnLColorClass } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PositionTable, copyPositionsToClipboard } from '@/components/portfolio/PositionTable';
import { PositionForm } from '@/components/portfolio/PositionForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Pencil, Download, Copy, Check, Trash2, MoreVertical, FileSpreadsheet } from 'lucide-react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';

const PERP_EXPOSURE_KEY = 'pa-portfolio-perp-exposure';

export default function Portfolio() {
  const { currency } = useCurrencyStore();
  const { data: positions, isLoading: positionsLoading } = usePositions();
  const { data: summary } = usePortfolioSummary();
  const deleteAllMutation = useDeleteAllPositions();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  // Perp exposure state
  const [perpExposure, setPerpExposure] = useState(() => {
    const saved = localStorage.getItem(PERP_EXPOSURE_KEY);
    return saved ? parseFloat(saved) : 0;
  });
  const [editingPerp, setEditingPerp] = useState(false);
  const [perpInput, setPerpInput] = useState('');

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

  // Handle perp exposure edit
  const handlePerpEdit = () => {
    setPerpInput(perpExposure.toString());
    setEditingPerp(true);
  };

  const handlePerpSave = () => {
    const value = parseFloat(perpInput) || 0;
    setPerpExposure(value);
    localStorage.setItem(PERP_EXPOSURE_KEY, value.toString());
    setEditingPerp(false);
  };

  const handlePerpKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePerpSave();
    } else if (e.key === 'Escape') {
      setEditingPerp(false);
    }
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (positions && positions.length > 0) {
                const success = await copyPositionsToClipboard(positions);
                if (success) {
                  setCopiedAll(true);
                  setTimeout(() => setCopiedAll(false), 2000);
                }
              }
            }}
            disabled={!positions || positions.length === 0}
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
            disabled={!positions || positions.length === 0}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete All
          </Button>
          <Button size="sm" onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Position
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => window.open(api.exportPositionsCsv(), '_blank')}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open(api.exportExcel(), '_blank')}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-2 md:grid-cols-5">
          <Card className="py-2">
            <CardHeader className="py-2 px-4">
              <p className="text-xs text-muted-foreground">Total Value</p>
              <CardTitle className="text-lg">
                {formatCurrency(convertValue(summary.totalValueUsd), currency, 0)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="py-2">
            <CardHeader className="py-2 px-4">
              <p className="text-xs text-muted-foreground">Cost Basis</p>
              <CardTitle className="text-lg">
                {formatCurrency(convertValue(summary.totalCostBasis), currency, 0)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="py-2">
            <CardHeader className="py-2 px-4">
              <p className="text-xs text-muted-foreground">Unrealized P&L</p>
              <CardTitle className={`text-lg ${getPnLColorClass(summary.unrealizedPnL)}`}>
                {formatCurrency(convertValue(summary.unrealizedPnL), currency, 0)}
                <span className="text-sm ml-1">({formatPercent(summary.unrealizedPnLPct)})</span>
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="py-2">
            <CardHeader className="py-2 px-4">
              <p className="text-xs text-muted-foreground">Exposure</p>
              <CardTitle className="text-lg">
                {summary.totalValueUsd > 0
                  ? `${(((cryptoTotal + perpExposure) / summary.totalValueUsd) * 100).toFixed(1)}%`
                  : '0%'}
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
                {formatCurrency(convertValue(cryptoTotal), currency, 0)}
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
              <div>
                <CardTitle className="text-base">Stables</CardTitle>
                {perpExposure > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Available: {formatCurrency(convertValue(stablesTotal - perpExposure), currency, 0)}
                  </p>
                )}
              </div>
              <div className="text-right">
                <span className="text-sm font-semibold text-muted-foreground">
                  {formatCurrency(convertValue(stablesTotal), currency, 0)}
                </span>
                <div className="flex items-center justify-end gap-2 mt-1">
                  {perpExposure > 0 && (
                    <span className="text-xs text-muted-foreground">
                      Perp: {formatCurrency(convertValue(perpExposure), currency, 0)}
                    </span>
                  )}
                  <button
                    onClick={handlePerpEdit}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <Pencil className="h-3 w-3" />
                    {perpExposure > 0 ? 'Edit' : 'Add Perp'}
                  </button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <PositionTable positions={stablesPositions} currency={currency} fxRate={fxRate} />
          </CardContent>
        </Card>
      )}

      {/* Add Position Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Position</DialogTitle>
          </DialogHeader>
          <PositionForm
            onSuccess={() => setShowAddForm(false)}
            cryptoCount={cryptoPositions.length}
            stablesCount={stablesPositions.length}
          />
        </DialogContent>
      </Dialog>

      {/* Perp Exposure Dialog */}
      <Dialog open={editingPerp} onOpenChange={setEditingPerp}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Perp Exposure</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enter your total open perp position size in USD. This will be added to your crypto exposure.
            </p>
            <div className="space-y-1">
              <label className="text-sm">Position Size (USD)</label>
              <Input
                type="number"
                value={perpInput}
                onChange={(e) => setPerpInput(e.target.value)}
                onKeyDown={handlePerpKeyDown}
                placeholder="0"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingPerp(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handlePerpSave}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete All Confirmation Dialog */}
      <Dialog open={showDeleteAllConfirm} onOpenChange={setShowDeleteAllConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete All Positions</DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete all <span className="font-semibold text-foreground">{positions?.length || 0}</span> positions?
              This will permanently remove all your portfolio data.
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

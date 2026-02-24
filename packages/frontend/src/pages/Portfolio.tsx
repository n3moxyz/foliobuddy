import { useState, useMemo } from 'react';
import { usePositions, usePortfolioSummary, useDeleteAllPositions } from '@/hooks/usePortfolio';
import { useCurrencyStore } from '@/stores/currencyStore';
import { formatCurrency, formatPercent, getPnLColorClass } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PositionTable, copyPositionsToClipboard } from '@/components/portfolio/PositionTable';
import { CollapsibleCard } from '@/components/portfolio/CollapsibleCard';
import { PositionForm } from '@/components/portfolio/PositionForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Pencil, Download, Copy, Check, Trash2, MoreVertical, FileSpreadsheet, Coins, Banknote, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { useCollapsibleState } from '@/hooks/useCollapsibleState';
import type { Position } from '@/lib/api';

const PERP_EXPOSURE_KEY = 'pa-portfolio-perp-exposure';

interface SectionConfig {
  id: string;
  label: string;
  filter: (p: Position) => boolean;
  icon: React.ReactNode;
  accentColor: string;
}

// Section config — add new categories here
const SECTION_CONFIG: SectionConfig[] = [
  {
    id: 'crypto',
    label: 'Crypto',
    filter: (p) => p.asset.category !== 'STABLECOIN' && p.asset.category !== 'CASH',
    icon: <Coins className="h-4 w-4 text-blue-500" />,
    accentColor: 'border-l-blue-500',
  },
  {
    id: 'stables',
    label: 'Stables',
    filter: (p) => p.asset.category === 'STABLECOIN' || p.asset.category === 'CASH',
    icon: <Banknote className="h-4 w-4 text-green-500" />,
    accentColor: 'border-l-green-500',
  },
  // Future: just add entries like:
  // { id: 'equities', label: 'Equities', filter: ..., icon: ..., accentColor: '...' },
];

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

  const { isExpanded, toggle } = useCollapsibleState();

  // Split positions: owned (custodyOf is null) vs custody (custodyOf is set)
  const { ownedPositions, custodyPositions } = useMemo(() => {
    if (!positions) return { ownedPositions: [] as Position[], custodyPositions: [] as Position[] };
    return {
      ownedPositions: positions.filter(p => !p.custodyOf),
      custodyPositions: positions.filter(p => !!p.custodyOf),
    };
  }, [positions]);

  // Build sections dynamically from config (owned positions only)
  const sections = useMemo(() => {
    return SECTION_CONFIG.map(config => {
      const filtered = ownedPositions.filter(config.filter);
      return {
        ...config,
        positions: filtered,
        total: filtered.reduce((s, p) => s + (p.marketValueUsd || 0), 0),
        pnl: filtered.reduce((s, p) => s + (p.unrealizedPnL || 0), 0),
      };
    }).filter(s => s.positions.length > 0);
  }, [ownedPositions]);

  // Custody section totals
  const custodyTotal = useMemo(() => {
    return custodyPositions.reduce((s, p) => s + (p.marketValueUsd || 0), 0);
  }, [custodyPositions]);

  // Unique custody names from existing positions (for dropdown)
  const existingCustodyNames = useMemo(() => {
    const names = new Set(custodyPositions.map(p => p.custodyOf).filter(Boolean) as string[]);
    return Array.from(names).sort();
  }, [custodyPositions]);

  // Derived total for exposure calc in summary cards
  const cryptoTotal = sections.find(s => s.id === 'crypto')?.total ?? 0;

  return (
    <div className="space-y-3">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Portfolio</h1>
          <p className="text-sm text-muted-foreground">
            Manage your positions and holdings
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Secondary actions hidden on mobile, in dropdown */}
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
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
            className="hidden sm:inline-flex"
            onClick={() => setShowDeleteAllConfirm(true)}
            disabled={!positions || positions.length === 0}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete All
          </Button>
          <Button size="sm" className="touch-manipulation" onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Position
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="touch-manipulation">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* Mobile-only actions */}
              <DropdownMenuItem
                className="sm:hidden"
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
                <Copy className="h-4 w-4 mr-2" />
                Copy All
              </DropdownMenuItem>
              <DropdownMenuItem
                className="sm:hidden text-destructive"
                onClick={() => setShowDeleteAllConfirm(true)}
                disabled={!positions || positions.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete All
              </DropdownMenuItem>
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
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
              <p className="text-xs text-muted-foreground">YTD Start</p>
              <CardTitle className="text-lg">
                {formatCurrency(convertValue(summary.totalCostBasis), currency, 0)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card className="py-2">
            <CardHeader className="py-2 px-4">
              <p className="text-xs text-muted-foreground">YTD P&L</p>
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

      {/* Position Sections */}
      {!positionsLoading && sections.map(section => (
        <CollapsibleCard
          key={section.id}
          title={`${section.label} (${section.positions.length})`}
          icon={section.icon}
          accentColor={section.accentColor}
          isExpanded={isExpanded(section.id)}
          onToggle={() => toggle(section.id)}
          headerRight={
            <div className="flex items-center gap-3">
              {!isExpanded(section.id) && (
                <>
                  <span className="text-xs text-muted-foreground">
                    {section.positions.length} position{section.positions.length !== 1 ? 's' : ''}
                  </span>
                  {section.pnl !== 0 && (
                    <span className={`text-xs font-medium ${getPnLColorClass(section.pnl)}`}>
                      {formatCurrency(convertValue(section.pnl), currency, 0)}
                    </span>
                  )}
                </>
              )}
              <span className="text-sm font-semibold text-muted-foreground">
                {formatCurrency(convertValue(section.total), currency, 0)}
              </span>
            </div>
          }
          headerExtra={
            section.id === 'stables' ? (
              <div className="flex items-center justify-end gap-2 mt-1">
                {perpExposure > 0 && (
                  <>
                    <span className="text-xs text-muted-foreground">
                      Available: {formatCurrency(convertValue(section.total - perpExposure), currency, 0)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Perp: {formatCurrency(convertValue(perpExposure), currency, 0)}
                    </span>
                  </>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handlePerpEdit(); }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <Pencil className="h-3 w-3" />
                  {perpExposure > 0 ? 'Edit' : 'Add Perp'}
                </button>
              </div>
            ) : undefined
          }
        >
          <PositionTable
            positions={section.positions}
            currency={currency}
            fxRate={fxRate}
            sectionPrefix={section.id}
          />
        </CollapsibleCard>
      ))}

      {/* Custody: Held for Others */}
      {!positionsLoading && custodyPositions.length > 0 && (
        <CollapsibleCard
          title={`Held for Others (${custodyPositions.length})`}
          icon={<Users className="h-4 w-4 text-purple-500" />}
          accentColor="border-l-purple-500"
          isExpanded={isExpanded('custody')}
          onToggle={() => toggle('custody')}
          headerRight={
            <div className="flex items-center gap-3">
              {!isExpanded('custody') && (
                <span className="text-xs text-muted-foreground">
                  {custodyPositions.length} position{custodyPositions.length !== 1 ? 's' : ''}
                </span>
              )}
              <span className="text-sm font-semibold text-muted-foreground">
                {formatCurrency(convertValue(custodyTotal), currency, 0)}
              </span>
            </div>
          }
        >
          <PositionTable
            positions={custodyPositions}
            currency={currency}
            fxRate={fxRate}
            sectionPrefix="custody"
          />
        </CollapsibleCard>
      )}

      {/* Add Position Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Position</DialogTitle>
          </DialogHeader>
          <PositionForm
            onSuccess={() => setShowAddForm(false)}
            cryptoCount={sections.find(s => s.id === 'crypto')?.positions.length ?? 0}
            stablesCount={sections.find(s => s.id === 'stables')?.positions.length ?? 0}
            existingCustodyNames={existingCustodyNames}
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

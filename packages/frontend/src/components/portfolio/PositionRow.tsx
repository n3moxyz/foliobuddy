import React from 'react';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  getPnLColorClass,
  getPriceAgeInfo,
  isStablecoinCategory,
  priceAgeClass,
} from '@/lib/utils';
import { Pencil, Trash2, Copy, Check, RefreshCw } from 'lucide-react';
import type { Position } from '@/lib/types';

const STORAGE_TYPE_LABELS: Record<string, string> = {
  WALLET: 'Onchain',
  CEX: 'CEX',
  DEFI: 'DeFi',
  BANK: 'Bank',
};

interface PositionRowProps {
  position: Position;
  currency: 'USD' | 'SGD';
  fxRate: number;
  copiedId: string | null;
  showAllColumns?: boolean;
  onView: (position: Position) => void;
  onEdit: (position: Position) => void;
  onDelete: (position: Position) => void;
  onCopy: (position: Position, e: React.MouseEvent) => void;
  onUpdateNav?: (position: Position) => void;
}

export const PositionRow = React.memo(function PositionRow({
  position,
  currency,
  fxRate,
  copiedId,
  showAllColumns = false,
  onView,
  onEdit,
  onDelete,
  onCopy,
  onUpdateNav,
}: PositionRowProps) {
  // Helper to convert USD values to selected currency
  const convert = (usdValue: number | null | undefined) => {
    if (usdValue === null || usdValue === undefined) return usdValue;
    return currency === 'SGD' ? usdValue * fxRate : usdValue;
  };

  // Smart decimal formatting: 3 digits or less = 2dp, 4+ digits = 0dp
  const getSmartDecimals = (value: number | null | undefined): number => {
    if (value === null || value === undefined) return 2;
    const absValue = Math.abs(value);
    return absValue < 1000 ? 2 : 0;
  };

  const totalCost = position.quantity * position.avgCostUsd;
  const isStable = isStablecoinCategory(position.asset.category);
  const isManual = position.asset.priceProvider === 'manual';
  const ageInfo = isManual ? getPriceAgeInfo(position.asset.priceUpdatedAt) : null;

  // Match PositionTable: hidden on mobile unless toggle is on
  const HIDDEN_MOBILE = showAllColumns ? '' : 'hidden md:table-cell';

  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/50"
      onClick={() => onView(position)}
      tabIndex={0}
      aria-label={`View ${position.asset.symbol} position`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onView(position);
        }
      }}
    >
      <TableCell>
        <div className="truncate">
          <p className="font-medium text-sm">{position.asset.symbol}</p>
          <p className="text-xs text-muted-foreground truncate">{position.asset.name}</p>
          {ageInfo && (
            <p
              className={`text-xs ${priceAgeClass(ageInfo.severity)} truncate`}
              title={
                position.asset.priceUpdatedAt
                  ? `NAV updated ${new Date(position.asset.priceUpdatedAt).toLocaleString()}`
                  : 'NAV never set'
              }
            >
              NAV {ageInfo.label}
            </p>
          )}
        </div>
      </TableCell>
      <TableCell className={`text-right font-mono text-sm ${HIDDEN_MOBILE}`}>
        {isStable ? formatNumber(position.quantity, 0) : formatNumber(position.quantity, 4)}
      </TableCell>
      <TableCell className={`text-right font-mono text-sm ${HIDDEN_MOBILE}`}>
        {formatCurrency(
          convert(position.avgCostUsd),
          currency,
          getSmartDecimals(convert(position.avgCostUsd))
        )}
      </TableCell>
      <TableCell className={`text-right font-mono text-sm ${HIDDEN_MOBILE}`}>
        {formatCurrency(convert(totalCost), currency, 0)}
      </TableCell>
      <TableCell
        className={`text-right font-mono text-sm text-muted-foreground ${HIDDEN_MOBILE}`}
      >
        {formatCurrency(
          convert(position.asset.currentPriceUsd),
          currency,
          getSmartDecimals(convert(position.asset.currentPriceUsd))
        )}
      </TableCell>
      <TableCell className="text-right font-mono text-sm font-medium">
        {formatCurrency(convert(position.marketValueUsd), currency, 0)}
      </TableCell>
      <TableCell className="text-right">
        <div className={getPnLColorClass(position.unrealizedPnL)}>
          <p className="font-mono text-sm">
            {formatCurrency(convert(position.unrealizedPnL), currency, 0)}
          </p>
          <p className="text-xs">{formatPercent(position.unrealizedPnLPct)}</p>
        </div>
      </TableCell>
      <TableCell className={`text-right ${HIDDEN_MOBILE}`}>
        <div className="truncate">
          <p className="text-sm">
            {STORAGE_TYPE_LABELS[position.storageType] || position.storageType}
          </p>
          {position.storageLocation && (
            <p className="text-xs text-muted-foreground italic truncate">
              {position.storageLocation}
            </p>
          )}
        </div>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 touch-manipulation"
            onClick={(e) => onCopy(position, e)}
            title="Copy position"
            aria-label="Copy position"
          >
            {copiedId === position.id ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          {onUpdateNav && position.asset.category === 'UNIT_TRUST' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 touch-manipulation"
              onClick={() => onUpdateNav(position)}
              title="Update NAV"
              aria-label="Update NAV"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 touch-manipulation"
            onClick={() => onEdit(position)}
            aria-label="Edit position"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 touch-manipulation"
            onClick={() => onDelete(position)}
            aria-label="Delete position"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});

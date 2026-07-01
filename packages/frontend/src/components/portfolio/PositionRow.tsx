import React from 'react';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  formatCurrency,
  formatQuantity,
  formatPercent,
  formatDateTime,
  getPnLColorClass,
  getPriceAgeInfo,
  isStablecoinCategory,
  priceAgeClass,
} from '@/lib/utils';
import { Pencil, Trash2, Copy, Check, RefreshCw } from 'lucide-react';
import type { Position } from '@/lib/types';
import { localPriceLabel, type UsdFxRatesByCurrency } from './positionPriceDisplay';

const STORAGE_TYPE_LABELS: Record<string, string> = {
  WALLET: 'Onchain',
  CEX: 'CEX',
  DEFI: 'DeFi',
  BANK: 'Bank',
  BROKERAGE: 'Broker account',
};

function storageLabelForPosition(position: Position): string {
  if (position.storageType === 'BROKERAGE') {
    return position.storageLocation || 'Broker account';
  }

  const storageType = STORAGE_TYPE_LABELS[position.storageType] || position.storageType;
  return position.storageLocation ? `${storageType} · ${position.storageLocation}` : storageType;
}

function UnitTrustBadge() {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex h-5 shrink-0 cursor-default items-center rounded-sm border border-warning/35 bg-warning/15 px-1.5 text-[10px] font-semibold leading-none text-warning outline-none ring-offset-background transition-colors hover:border-warning/50 hover:bg-warning/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Unit Trust"
            tabIndex={0}
            onClick={(event) => event.stopPropagation()}
          >
            UT
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          className="border-warning/25 bg-background/95 px-2.5 py-1 text-xs font-medium text-foreground shadow-lg shadow-[hsl(234_45%_7%/0.3)] backdrop-blur supports-[backdrop-filter]:bg-background/90"
        >
          Unit Trust
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface PositionPreviewProps {
  position: Position;
  currency: 'USD' | 'SGD';
  convert: (usdValue: number | null | undefined) => number | null | undefined;
  getSmartDecimals: (value: number | null | undefined) => number;
  totalCost: number;
  storageLabel: string;
  localCurrentPrice: string | null;
  localAvgCost: string | null;
}

function PositionPreview({
  position,
  currency,
  convert,
  getSmartDecimals,
  totalCost,
  storageLabel,
  localCurrentPrice,
  localAvgCost,
}: PositionPreviewProps) {
  const pnlClass = getPnLColorClass(position.unrealizedPnL);
  const currentPrice = convert(position.asset.currentPriceUsd);
  const avgCost = convert(position.avgCostUsd);

  return (
    <div className="w-72 space-y-3 p-1 text-xs">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{position.asset.symbol}</p>
          <p className="truncate text-muted-foreground">{position.asset.name}</p>
        </div>
        <div className={`shrink-0 text-right font-mono tabular-nums ${pnlClass}`}>
          <p>{formatCurrency(convert(position.unrealizedPnL), currency, 0)}</p>
          <p>{formatPercent(position.unrealizedPnLPct)}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border bg-muted/20 px-2 py-1.5">
          <p className="text-muted-foreground">Value</p>
          <p className="font-mono font-medium tabular-nums">
            {formatCurrency(convert(position.marketValueUsd), currency, 0)}
          </p>
        </div>
        <div className="rounded-md border bg-muted/20 px-2 py-1.5">
          <p className="text-muted-foreground">Cost</p>
          <p className="font-mono font-medium tabular-nums">
            {formatCurrency(convert(totalCost), currency, 0)}
          </p>
        </div>
        <div className="rounded-md border bg-muted/20 px-2 py-1.5">
          <p className="text-muted-foreground">Qty</p>
          <p className="truncate font-mono font-medium tabular-nums">
            {formatQuantity(position.quantity, position.asset.category)}
          </p>
        </div>
      </div>

      <div className="space-y-1.5 border-t pt-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Price</span>
          <span className="font-mono tabular-nums">
            {formatCurrency(currentPrice, currency, getSmartDecimals(currentPrice))}
          </span>
        </div>
        {localCurrentPrice && (
          <p className="text-right font-mono text-[11px] leading-none text-muted-foreground">
            {localCurrentPrice}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Avg cost</span>
          <span className="font-mono tabular-nums">
            {formatCurrency(avgCost, currency, getSmartDecimals(avgCost))}
          </span>
        </div>
        {localAvgCost && (
          <p className="text-right font-mono text-[11px] leading-none text-muted-foreground">
            {localAvgCost}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Storage</span>
          <span className="max-w-[11rem] truncate text-right">{storageLabel}</span>
        </div>
      </div>
    </div>
  );
}

interface PositionRowProps {
  position: Position;
  currency: 'USD' | 'SGD';
  fxRate: number;
  usdFxRates: UsdFxRatesByCurrency;
  copiedId: string | null;
  showAllColumns?: boolean;
  onView: (position: Position) => void;
  onEdit: (position: Position) => void;
  onDelete: (position: Position) => void;
  onCopy: (position: Position, e: React.MouseEvent) => void;
  onUpdateNav?: (position: Position) => void;
  showUnitTrustBadge?: boolean;
}

export const PositionRow = React.memo(function PositionRow({
  position,
  currency,
  fxRate,
  usdFxRates,
  copiedId,
  showAllColumns = false,
  onView,
  onEdit,
  onDelete,
  onCopy,
  onUpdateNav,
  showUnitTrustBadge = false,
}: PositionRowProps) {
  const [previewOpen, setPreviewOpen] = React.useState(false);

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
  const isUnitTrust = position.asset.category === 'UNIT_TRUST';
  const shouldShowNavAge = isUnitTrust || (isManual && !isStable);
  const ageInfo = shouldShowNavAge ? getPriceAgeInfo(position.asset.priceUpdatedAt) : null;
  const assetNameLabel = isStable ? 'Cash' : position.asset.name;
  const priceUpdatedTitle = position.asset.priceUpdatedAt
    ? `NAV updated ${formatDateTime(position.asset.priceUpdatedAt)}`
    : 'NAV never set';
  const localCurrentPrice = localPriceLabel({
    usdPrice: position.asset.currentPriceUsd,
    nativeCurrency: position.asset.nativeCurrency,
    displayCurrency: currency,
    usdFxRates,
  });
  const localAvgCost = localPriceLabel({
    usdPrice: position.avgCostUsd,
    nativeCurrency: position.asset.nativeCurrency,
    displayCurrency: currency,
    usdFxRates,
  });
  const storageLabel = storageLabelForPosition(position);

  // Match PositionTable: hidden on mobile unless toggle is on
  const HIDDEN_MOBILE = showAllColumns ? '' : 'hidden md:table-cell';

  return (
    <TableRow
      className="cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      onClick={() => onView(position)}
      onMouseEnter={() => setPreviewOpen(true)}
      onMouseLeave={() => setPreviewOpen(false)}
      onFocus={() => setPreviewOpen(true)}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
          setPreviewOpen(false);
        }
      }}
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
        <TooltipProvider delayDuration={150}>
          <Tooltip open={previewOpen}>
            <TooltipTrigger asChild>
              <div className="truncate">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="truncate text-sm font-medium">{position.asset.symbol}</p>
                  {showUnitTrustBadge && isUnitTrust && <UnitTrustBadge />}
                </div>
                <p className="text-xs text-muted-foreground truncate">{assetNameLabel}</p>
                {ageInfo && (
                  <p
                    className={`text-xs ${priceAgeClass(ageInfo.severity)} truncate`}
                    title={priceUpdatedTitle}
                  >
                    NAV {ageInfo.label}
                  </p>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent
              side="right"
              align="start"
              sideOffset={12}
              className="hidden border bg-popover/95 p-2 text-popover-foreground shadow-xl shadow-[hsl(234_45%_7%/0.25)] backdrop-blur supports-[backdrop-filter]:bg-popover/90 md:block"
            >
              <PositionPreview
                position={position}
                currency={currency}
                convert={convert}
                getSmartDecimals={getSmartDecimals}
                totalCost={totalCost}
                storageLabel={storageLabel}
                localCurrentPrice={localCurrentPrice}
                localAvgCost={localAvgCost}
              />
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
      <TableCell className={`text-right font-mono text-sm ${HIDDEN_MOBILE}`}>
        {formatQuantity(position.quantity, position.asset.category)}
      </TableCell>
      <TableCell className={`text-right font-mono text-sm ${HIDDEN_MOBILE}`}>
        <p>
          {formatCurrency(
            convert(position.avgCostUsd),
            currency,
            getSmartDecimals(convert(position.avgCostUsd))
          )}
        </p>
        {localAvgCost && (
          <p className="mt-0.5 text-[11px] leading-none text-muted-foreground">{localAvgCost}</p>
        )}
      </TableCell>
      <TableCell className={`text-right font-mono text-sm ${HIDDEN_MOBILE}`}>
        {formatCurrency(convert(totalCost), currency, 0)}
      </TableCell>
      <TableCell className={`text-right font-mono text-sm text-muted-foreground ${HIDDEN_MOBILE}`}>
        <p>
          {formatCurrency(
            convert(position.asset.currentPriceUsd),
            currency,
            getSmartDecimals(convert(position.asset.currentPriceUsd))
          )}
        </p>
        {localCurrentPrice && (
          <p className="mt-0.5 text-[11px] leading-none text-muted-foreground">
            {localCurrentPrice}
          </p>
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
      <TableCell className={`text-left ${HIDDEN_MOBILE}`}>
        <div className="min-w-0">
          {position.storageType === 'BROKERAGE' ? (
            <p className="max-w-[9rem] whitespace-normal break-words text-sm leading-snug">
              {storageLabel}
            </p>
          ) : (
            <>
              <p className="max-w-[9rem] whitespace-normal break-words text-sm leading-snug">
                {STORAGE_TYPE_LABELS[position.storageType] || position.storageType}
              </p>
              {position.storageLocation && (
                <p className="mt-0.5 max-w-[9rem] whitespace-normal break-words text-xs italic leading-snug text-muted-foreground">
                  {position.storageLocation}
                </p>
              )}
            </>
          )}
        </div>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="-mx-1 h-11 w-11 shrink-0 touch-manipulation md:mx-0 md:h-8 md:w-8"
            onClick={(e) => onCopy(position, e)}
            title="Copy position"
            aria-label="Copy position"
          >
            {copiedId === position.id ? (
              <Check className="h-4 w-4 text-profit" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          {onUpdateNav && position.asset.category === 'UNIT_TRUST' && (
            <Button
              variant="ghost"
              size="icon"
              className="-mx-1 h-11 w-11 shrink-0 touch-manipulation md:mx-0 md:h-8 md:w-8"
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
            className="-mx-1 h-11 w-11 shrink-0 touch-manipulation md:mx-0 md:h-8 md:w-8"
            onClick={() => onEdit(position)}
            aria-label="Edit position"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="-mx-1 h-11 w-11 shrink-0 touch-manipulation md:mx-0 md:h-8 md:w-8"
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

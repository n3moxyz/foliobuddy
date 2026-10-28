import type { ReactNode } from 'react';
import type { Asset } from '@/lib/types';

export function PositionAssetSummary({
  asset,
  action,
}: {
  asset: Pick<Asset, 'symbol' | 'name'>;
  action?: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label="Selected asset"
      className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 p-3"
    >
      <div className="min-w-0">
        <p className="break-all font-medium">{asset.symbol}</p>
        <p className="break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {asset.name}
        </p>
      </div>
      {action}
    </div>
  );
}

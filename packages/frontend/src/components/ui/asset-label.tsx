import type { ReactNode } from 'react';
import { assetDisplayName, type AssetIdentity } from '@/lib/assetDisplayName';
import { cn } from '@/lib/utils';

/** Shared list identity: complete ticker, readable name, and an optional type badge. */
export function AssetLabel({
  asset,
  badge,
  nameOverride,
  className,
}: {
  asset: AssetIdentity;
  badge?: ReactNode;
  nameOverride?: string;
  className?: string;
}) {
  const name = nameOverride ?? assetDisplayName(asset);
  return (
    <div className={cn('min-w-0 space-y-0.5', className)}>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{asset.symbol}</p>
        {badge}
      </div>
      {name !== asset.symbol && (
        <p
          className="whitespace-normal break-words text-xs font-normal leading-snug text-muted-foreground [overflow-wrap:anywhere]"
          title={asset.name}
        >
          {name}
        </p>
      )}
    </div>
  );
}

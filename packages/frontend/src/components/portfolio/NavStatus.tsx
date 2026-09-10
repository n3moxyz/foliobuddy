import type { Asset } from '@/lib/types';
import { formatDateTime, getPriceAgeInfo, priceAgeClass } from '@/lib/utils';
import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';

function navDateLabel(value: string | null | undefined): string {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'NAV date unavailable';
  return `NAV as of ${new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })}`;
}

export function NavStatus({ asset, detailed = false }: { asset: Asset; detailed?: boolean }) {
  const { formatCurrency } = useMoneyFormatter();
  if (asset.category !== 'UNIT_TRUST') return null;
  const date = navDateLabel(asset.priceAsOf);
  const automatic = asset.priceProvider !== 'manual';
  const source =
    asset.priceSource === 'fund-manager'
      ? 'Fund manager · daily NAV'
      : asset.priceSource === 'yahoo'
        ? 'Yahoo · daily NAV'
        : automatic
          ? 'Statement/manual fallback'
          : 'Statement/manual NAV';
  const checked = automatic
    ? asset.priceCheckedAt
      ? `Last checked ${formatDateTime(asset.priceCheckedAt)}`
      : 'Awaiting first check'
    : 'Updated from statements or manual entries';
  const failed = asset.priceCheckStatus === 'error';
  return (
    <div
      className="text-xs"
      title={`${date}. ${source}. ${checked}${failed ? '. Refresh failed; retaining last known NAV.' : ''}`}
    >
      <p className={priceAgeClass(getPriceAgeInfo(asset.priceAsOf).severity)}>{date}</p>
      {failed && <p className="text-warning">Refresh failed · last known NAV</p>}
      {detailed && (
        <div className="mt-1 space-y-1 text-muted-foreground">
          {asset.currentPriceNative != null && ['USD', 'SGD'].includes(asset.nativeCurrency) && (
            <p className="font-mono">
              Published NAV:{' '}
              {formatCurrency(asset.currentPriceNative, asset.nativeCurrency as 'USD' | 'SGD', 4)}
            </p>
          )}
          <p>{source}</p>
          <p>{checked}</p>
          {asset.isin && <p>ISIN {asset.isin}</p>}
        </div>
      )}
    </div>
  );
}

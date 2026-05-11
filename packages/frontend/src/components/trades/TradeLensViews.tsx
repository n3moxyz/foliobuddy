import { useState, type ReactNode } from 'react';
import { CalendarDays, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate, formatNumber, getPnLColorClass } from '@/lib/utils';
import type { Trade } from '@/lib/types';
import {
  topTagsForTrades,
  type MonthlyReview,
  type TickerDossier,
} from '@/components/trades/tradeLensModels';

function convertCurrency(usdValue: number, currency: 'USD' | 'SGD', fxRate: number) {
  return currency === 'SGD' ? usdValue * fxRate : usdValue;
}

function formatSignedCurrency(value: number, currency: 'USD' | 'SGD', decimals = 0) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatCurrency(value, currency, decimals)}`;
}

export function TickerDossierLens({
  selectedTicker,
  tickerDossiers,
  currency,
  fxRate,
  onTickerClick,
  onClear,
  onTradeClick,
}: {
  selectedTicker: TickerDossier | null;
  tickerDossiers: TickerDossier[];
  currency: 'USD' | 'SGD';
  fxRate: number;
  onTickerClick: (symbol: string) => void;
  onClear: () => void;
  onTradeClick: (tradeId: string) => void;
}) {
  if (!selectedTicker) {
    return <LensEmpty icon={<Target className="h-8 w-8" />} title="No ticker dossier yet" />;
  }

  const recentClosed = [...selectedTicker.closedTrades].sort(
    (a, b) =>
      new Date(b.exitDate ?? b.entryDate).getTime() - new Date(a.exitDate ?? a.entryDate).getTime()
  );

  return (
    <div className="space-y-5">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tickerDossiers.map((ticker) => (
          <button
            key={ticker.symbol}
            type="button"
            aria-pressed={ticker.symbol === selectedTicker.symbol}
            onClick={() => onTickerClick(ticker.symbol)}
            className={`min-h-11 shrink-0 rounded-md border px-3 py-2 text-left transition-colors ${
              ticker.symbol === selectedTicker.symbol
                ? 'border-primary bg-primary/10 text-primary'
                : 'bg-card/50 hover:bg-muted/50'
            }`}
          >
            <span className="block text-sm font-semibold">{ticker.symbol}</span>
            <span className={`block text-xs tabular-nums ${getPnLColorClass(ticker.totalPnL)}`}>
              {formatSignedCurrency(convertCurrency(ticker.totalPnL, currency, fxRate), currency)}
            </span>
          </button>
        ))}
      </div>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="rounded-md border bg-card/70 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Ticker Dossier
              </p>
              <div className="mt-1 flex items-center gap-2">
                <h2 className="text-3xl font-bold">{selectedTicker.symbol}</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11 px-3 text-xs sm:h-8 sm:min-h-8 sm:px-2"
                  onClick={onClear}
                >
                  Clear
                </Button>
              </div>
              <p className="mt-1 max-w-md truncate text-sm text-muted-foreground">
                {selectedTicker.name}
              </p>
            </div>
            <p
              className={`text-2xl font-bold tabular-nums ${getPnLColorClass(selectedTicker.totalPnL)}`}
            >
              {formatSignedCurrency(
                convertCurrency(selectedTicker.totalPnL, currency, fxRate),
                currency
              )}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 divide-x divide-y divide-border rounded-md border bg-background/40 sm:grid-cols-4 sm:divide-y-0">
            <MiniMetric label="Trades" value={String(selectedTicker.trades.length)} />
            <MiniMetric label="Win rate" value={`${formatNumber(selectedTicker.winRate, 0)}%`} />
            <MiniMetric
              label="Avg hold"
              value={selectedTicker.avgHoldDays ? `${selectedTicker.avgHoldDays}d` : '-'}
            />
            <MiniMetric
              label="Avg size"
              value={formatCurrency(
                convertCurrency(selectedTicker.avgPositionSizeUsd, currency, fxRate),
                currency,
                true
              )}
            />
          </div>

          <TagList tags={selectedTicker.topTags} className="mt-4" />
        </div>

        <div className="rounded-md border bg-card/70 p-4 sm:p-5">
          <p className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Extremes
          </p>
          <div className="divide-y divide-border">
            <TradeEdgeRow
              label="Largest win"
              trade={selectedTicker.largestWin}
              currency={currency}
              fxRate={fxRate}
              onTradeClick={onTradeClick}
            />
            <TradeEdgeRow
              label="Largest loss"
              trade={selectedTicker.largestLoss}
              currency={currency}
              fxRate={fxRate}
              onTradeClick={onTradeClick}
            />
            <InsightRow
              label="Open exposure"
              value={`${selectedTicker.openCount} open`}
              detail={`${selectedTicker.closedTrades.length} closed`}
              tone={selectedTicker.openCount > 0 ? 'info' : 'muted'}
            />
          </div>
        </div>
      </section>

      {recentClosed.length > 0 && (
        <section className="rounded-md border bg-card/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent closed trades</h3>
            <span className="text-xs text-muted-foreground">{recentClosed.length} total</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {recentClosed.slice(0, 6).map((trade) => (
              <TradeMiniButton
                key={trade.id}
                trade={trade}
                currency={currency}
                fxRate={fxRate}
                onClick={() => onTradeClick(trade.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function MonthlyPostmortemLens({
  monthlyReviews,
  openTrades,
  currency,
  fxRate,
  onTradeClick,
}: {
  monthlyReviews: MonthlyReview[];
  openTrades: Trade[];
  currency: 'USD' | 'SGD';
  fxRate: number;
  onTradeClick: (tradeId: string) => void;
}) {
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  if (monthlyReviews.length === 0) {
    return <LensEmpty icon={<CalendarDays className="h-8 w-8" />} title="No closed months yet" />;
  }

  const selectedMonth =
    monthlyReviews.find((month) => month.key === selectedMonthKey) ?? monthlyReviews[0];
  const winningTags = topTagsForTrades(
    selectedMonth.trades.filter((trade) => (trade.realizedPnL ?? 0) > 0)
  );
  const losingTrades = selectedMonth.trades
    .filter((trade) => (trade.realizedPnL ?? 0) < 0)
    .sort((a, b) => (a.realizedPnL ?? 0) - (b.realizedPnL ?? 0));

  return (
    <div className="space-y-5">
      <section className="rounded-md border bg-card/70 p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Monthly Postmortem
            </p>
            <h2 className="mt-1 text-2xl font-bold">{selectedMonth.label}</h2>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {monthlyReviews.map((month) => (
              <button
                key={month.key}
                type="button"
                aria-pressed={month.key === selectedMonth.key}
                onClick={() => setSelectedMonthKey(month.key)}
                className={`min-h-11 shrink-0 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  month.key === selectedMonth.key
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'bg-background/40 hover:bg-muted/50'
                }`}
              >
                <span className="block font-medium">{month.label}</span>
                <span className={`block text-xs tabular-nums ${getPnLColorClass(month.totalPnL)}`}>
                  {formatSignedCurrency(
                    convertCurrency(month.totalPnL, currency, fxRate),
                    currency
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-border rounded-md border bg-background/40 sm:grid-cols-4 sm:divide-y-0">
          <MiniMetric
            label="P&L"
            value={formatSignedCurrency(
              convertCurrency(selectedMonth.totalPnL, currency, fxRate),
              currency
            )}
            valueClass={getPnLColorClass(selectedMonth.totalPnL)}
          />
          <MiniMetric label="Trades" value={String(selectedMonth.count)} />
          <MiniMetric label="Win rate" value={`${formatNumber(selectedMonth.winRate, 0)}%`} />
          <MiniMetric
            label="Win / Loss"
            value={`${selectedMonth.wins} / ${selectedMonth.losses}`}
          />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <section className="rounded-md border bg-card/70 p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-semibold">Repeatable edge</h3>
          <TagList tags={winningTags.length > 0 ? winningTags : selectedMonth.topTags} />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <TradeMiniButton
              trade={selectedMonth.largestWin}
              currency={currency}
              fxRate={fxRate}
              onClick={() => selectedMonth.largestWin && onTradeClick(selectedMonth.largestWin.id)}
              emptyLabel="No winning trade"
            />
            <TradeMiniButton
              trade={selectedMonth.largestLoss}
              currency={currency}
              fxRate={fxRate}
              onClick={() =>
                selectedMonth.largestLoss && onTradeClick(selectedMonth.largestLoss.id)
              }
              emptyLabel="No losing trade"
            />
          </div>
        </section>

        <section className="rounded-md border bg-card/70 p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-semibold">Loss review</h3>
          {losingTrades.length > 0 ? (
            <div className="divide-y divide-border">
              {losingTrades.slice(0, 3).map((trade) => (
                <TradeEdgeRow
                  key={trade.id}
                  label={trade.asset.symbol}
                  trade={trade}
                  currency={currency}
                  fxRate={fxRate}
                  onTradeClick={onTradeClick}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-md bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
              No losses in this month.
            </p>
          )}
        </section>
      </div>

      {openTrades.length > 0 && (
        <section className="rounded-md border bg-card/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Open trades watchlist</h3>
            <span className="text-xs text-muted-foreground">{openTrades.length} open</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {openTrades.slice(0, 6).map((trade) => (
              <TradeMiniButton
                key={trade.id}
                trade={trade}
                currency={currency}
                fxRate={fxRate}
                onClick={() => onTradeClick(trade.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MiniMetric({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="min-w-0 p-3">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 truncate text-sm font-semibold tabular-nums ${valueClass ?? ''}`}>
        {value}
      </p>
    </div>
  );
}

function InsightRow({
  label,
  value,
  detail,
  tone = 'muted',
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'profit' | 'loss' | 'info' | 'muted';
  onClick?: () => void;
}) {
  const toneClass =
    tone === 'profit'
      ? 'text-profit'
      : tone === 'loss'
        ? 'text-loss'
        : tone === 'info'
          ? 'text-info'
          : 'text-foreground';
  const content = (
    <>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`truncate text-sm font-semibold ${toneClass}`}>{value}</p>
      </div>
      <p className="shrink-0 text-right text-xs text-muted-foreground">{detail}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-3 text-left transition-colors hover:bg-muted/50"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex w-full items-center justify-between gap-3 py-3 text-left">{content}</div>
  );
}

function TradeEdgeRow({
  label,
  trade,
  currency,
  fxRate,
  onTradeClick,
}: {
  label: string;
  trade: Trade | null;
  currency: 'USD' | 'SGD';
  fxRate: number;
  onTradeClick: (tradeId: string) => void;
}) {
  if (!trade) {
    return <InsightRow label={label} value="-" detail="No trade" />;
  }

  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-3 rounded-md py-3 text-left transition-colors hover:bg-muted/50 sm:px-2"
      onClick={() => onTradeClick(trade.id)}
    >
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{trade.asset.symbol}</p>
        <p className="truncate text-xs text-muted-foreground">
          {trade.notes || formatDate(trade.exitDate)}
        </p>
      </div>
      <p
        className={`shrink-0 text-right text-sm font-semibold tabular-nums ${getPnLColorClass(trade.realizedPnL)}`}
      >
        {formatSignedCurrency(convertCurrency(trade.realizedPnL ?? 0, currency, fxRate), currency)}
      </p>
    </button>
  );
}

function TradeMiniButton({
  trade,
  currency,
  fxRate,
  onClick,
  emptyLabel = 'No trade',
}: {
  trade: Trade | null;
  currency: 'USD' | 'SGD';
  fxRate: number;
  onClick: () => void;
  emptyLabel?: string;
}) {
  if (!trade) {
    return (
      <div className="rounded-md border border-dashed bg-background/30 p-3 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="rounded-md border bg-background/40 p-3 text-left transition-colors hover:bg-muted/50"
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-semibold">{trade.asset.symbol}</span>
        <span
          className={`shrink-0 text-sm font-semibold tabular-nums ${getPnLColorClass(trade.realizedPnL)}`}
        >
          {trade.realizedPnL !== null
            ? formatSignedCurrency(convertCurrency(trade.realizedPnL, currency, fxRate), currency)
            : 'Open'}
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {trade.direction} · {formatDate(trade.exitDate ?? trade.entryDate)}
      </p>
    </button>
  );
}

function TagList({
  tags,
  className = '',
}: {
  tags: Array<{ label: string; count: number }>;
  className?: string;
}) {
  if (tags.length === 0) {
    return <p className={`text-sm text-muted-foreground ${className}`}>No tags yet.</p>;
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {tags.map((tag) => (
        <span
          key={tag.label}
          className="rounded-full border bg-background/40 px-2.5 py-1 text-xs text-muted-foreground"
        >
          {tag.label} · {tag.count}
        </span>
      ))}
    </div>
  );
}

function LensEmpty({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="rounded-md border border-dashed bg-card/40 py-12 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <p className="font-medium">{title}</p>
    </div>
  );
}

import { useState, type ReactNode } from 'react';
import { Eye, EyeOff, FileText, ArrowRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Reveal } from './Reveal';

/** Shared shell for a bento block: quiet card, generous padding, no icon soup. */
function Block({
  title,
  lede,
  className,
  children,
}: {
  title: string;
  lede: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-5 rounded-lg border bg-card p-5 sm:p-6', className)}>
      <div>
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{lede}</p>
      </div>
      {children}
    </div>
  );
}

const LEDGER_ROWS = [
  { symbol: 'BTC', detail: 'Binance · CEX', chip: 'Crypto', dot: 'bg-crypto' },
  { symbol: 'NVDA', detail: 'IBKR · Broker', chip: 'Equities', dot: 'bg-equities' },
  { symbol: 'AB Income', detail: 'Broker · Unit Trust', chip: 'Equities', dot: 'bg-equities' },
  { symbol: 'USDC', detail: 'Onchain · Wallet', chip: 'Cash', dot: 'bg-cash' },
  { symbol: 'ETH', detail: 'Held for Others · Ledger', chip: 'Custody', dot: 'bg-custody' },
];

function LedgerDemo() {
  return (
    <div className="divide-y divide-border/60 rounded-md border bg-background/40 px-3">
      {LEDGER_ROWS.map((row) => (
        <div key={row.symbol + row.detail} className="flex items-center justify-between gap-3 py-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', row.dot)} />
            <div className="min-w-0">
              <div className="text-[13px] font-semibold leading-tight">{row.symbol}</div>
              <div className="truncate text-[11px] leading-tight text-muted-foreground">
                {row.detail}
              </div>
            </div>
          </div>
          <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {row.chip}
          </span>
        </div>
      ))}
    </div>
  );
}

const LENSES = [
  {
    id: 'review',
    label: 'Review',
    stat: 'Win rate 58% · Profit factor 2.4',
    line: 'Open, closed, and everything the tape remembers.',
  },
  {
    id: 'ticker',
    label: 'Ticker dossier',
    stat: 'SOL · 12 trades · +$8,420 lifetime',
    line: 'Every trade you have ever made in one name.',
  },
  {
    id: 'monthly',
    label: 'Monthly postmortem',
    stat: 'July: +4.2% · 2 losses reviewed',
    line: 'Month by month: edges that worked, losses examined.',
  },
] as const;

function TradeLensDemo() {
  const [active, setActive] = useState<(typeof LENSES)[number]['id']>('review');
  const lens = LENSES.find((l) => l.id === active) ?? LENSES[0];

  return (
    <div>
      {/* Plain toggle buttons, not a fake ARIA tab pattern: role=tab demands
          roving tabindex + arrow-key handling this demo doesn't need. */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Trade journal lenses">
        {LENSES.map((l) => (
          <button
            key={l.id}
            type="button"
            aria-pressed={active === l.id}
            onClick={() => setActive(l.id)}
            className={cn(
              'landing-press min-h-11 rounded-full border px-3 py-1.5 text-xs font-medium sm:min-h-0',
              active === l.id
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            {l.label}
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-md border bg-background/40 p-3">
        <div className="font-mono text-[13px] tabular-nums">{lens.stat}</div>
        <div className="mt-1 text-xs text-muted-foreground">{lens.line}</div>
      </div>
    </div>
  );
}

const PRIVATE_ROWS = [
  { label: 'Net worth', value: '$487,230' },
  { label: 'Best performer', value: 'SOL · +$8,420' },
  { label: 'Cash on hand', value: '$71,900' },
];

function PrivacyDemo() {
  const [hidden, setHidden] = useState(false);

  return (
    <div className="rounded-md border bg-background/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Try it</span>
        <button
          type="button"
          onClick={() => setHidden((h) => !h)}
          aria-pressed={hidden}
          className="landing-press inline-flex h-11 w-11 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent hover:text-accent-foreground sm:h-9 sm:w-9"
        >
          {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          <span className="sr-only">{hidden ? 'Show values' : 'Hide values'}</span>
        </button>
      </div>
      <div className="mt-2 space-y-1.5">
        {PRIVATE_ROWS.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-[13px]">
            <span className="text-muted-foreground">{row.label}</span>
            <span
              className={cn(
                'font-mono tabular-nums transition-[filter] duration-300',
                hidden && 'select-none blur-sm'
              )}
              aria-hidden={hidden}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
        One tap hides every amount across the app — screenshares and coffee shops included.
      </p>
    </div>
  );
}

function StatementDemo() {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-3 rounded-md border border-dashed px-3 py-2.5">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div className="text-[13px] font-medium leading-tight">broker-statement-Jun.pdf</div>
          <div className="text-[11px] text-muted-foreground">Monthly holdings statement · PDF</div>
        </div>
      </div>
      <div className="flex justify-center text-muted-foreground">
        <ArrowRight className="h-3.5 w-3.5 rotate-90" />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-md border bg-background/40 px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-[13px] font-medium leading-tight">AB Income Fund</div>
          <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
            12,304.221 units · NAV updated
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-profit px-2 py-0.5 text-[10px] font-medium text-profit">
          <Check className="h-3 w-3" /> Matched
        </span>
      </div>
    </div>
  );
}

const STAKES = [
  { name: 'You', pct: 72 },
  { name: 'Mum', pct: 18 },
  { name: 'Partner', pct: 10 },
];

function StakesDemo() {
  return (
    <div className="space-y-2.5 rounded-md border bg-background/40 p-3">
      {STAKES.map((stake) => (
        <div key={stake.name} className="flex items-center gap-3">
          <span className="w-14 shrink-0 text-xs text-muted-foreground">{stake.name}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-custody/70" style={{ width: `${stake.pct}%` }} />
          </div>
          <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
            {stake.pct}%
          </span>
        </div>
      ))}
    </div>
  );
}

function LivePriceDemo() {
  return (
    <div className="rounded-md border bg-background/40 p-3">
      <div className="flex items-center gap-2">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-profit opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-profit" />
        </span>
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Refreshing every minute
        </span>
      </div>
      <div className="mt-2.5 space-y-1.5 font-mono text-[13px] tabular-nums">
        <div className="flex items-center justify-between">
          <span>BTC</span>
          <span>
            $67,240 <span className="text-profit">▲2.1%</span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>NVDA</span>
          <span>
            $903.12 <span className="text-loss">▼0.8%</span>
          </span>
        </div>
      </div>
      <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
        Covers SGX, Tokyo, Taipei, Seoul and Oslo listings in their home currencies.
      </p>
    </div>
  );
}

const NEWS_ROWS = [
  {
    title: 'SEC approves spot Bitcoin ETF options',
    meta: 'Reuters · 2h ago · Regulation',
    symbol: 'BTC',
    dot: 'bg-crypto',
    important: true,
    primary: false,
  },
  {
    title: 'Nvidia raises full-year guidance on data-center demand',
    meta: 'Company announcement · 5h ago · Earnings',
    symbol: 'NVDA',
    dot: 'bg-equities',
    important: true,
    primary: true,
  },
  {
    title: 'Fed minutes show split over timing of next rate cut',
    meta: 'Bloomberg · 1h ago · Macro',
    symbol: 'Macro',
    dot: 'bg-macro',
    important: false,
    primary: false,
  },
  {
    title: 'Miner reserves fall ahead of difficulty adjustment',
    meta: 'The Block · 7h ago',
    symbol: 'BTC',
    dot: 'bg-crypto',
    important: false,
    primary: false,
  },
];

function NewsDemo() {
  return (
    <div className="divide-y divide-border/60 rounded-md border bg-background/40 px-3">
      {NEWS_ROWS.map((row) => (
        <div key={row.title} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium leading-tight">{row.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] leading-tight text-muted-foreground">
              {row.important && (
                <span className="rounded border border-primary/30 bg-primary/10 px-1 py-px font-semibold text-primary">
                  Important
                </span>
              )}
              {row.primary && (
                <span className="rounded border px-1 py-px font-semibold">Primary source</span>
              )}
              <span className="truncate">{row.meta}</span>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            <span className={cn('h-1.5 w-1.5 rounded-full', row.dot)} aria-hidden="true" />
            {row.symbol}
          </span>
        </div>
      ))}
    </div>
  );
}

const EXTRAS = [
  'USD / SGD, switch anywhere',
  'Copy-paste JSON import',
  'Keyboard-first navigation',
  'Live updates, no refresh needed',
  'Dark and light themes',
  'Funding costs on perps',
  'AI summaries on top stories',
];

/**
 * Capabilities as an asymmetric bento — every block demonstrates instead of
 * describing, and no two rows share the same shape.
 */
export function CapabilityBento() {
  return (
    <section aria-labelledby="capabilities-heading" className="mx-auto max-w-6xl px-4 sm:px-6">
      <Reveal>
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Capabilities
        </div>
        <h2
          id="capabilities-heading"
          className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl"
        >
          Built to hold everything you own
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Portfolios don't live on one exchange. FolioBuddy is one calm ledger for coins, stocks,
          funds, cash and the money you hold for other people.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
        <Reveal className="lg:col-span-7" delay={0}>
          <Block
            title="Every asset class, one ledger"
            lede="Crypto on exchanges and chains, equities and unit trusts at brokers, cash in banks — grouped the way you actually hold them, custody kept separate from what's yours."
            className="h-full"
          >
            <LedgerDemo />
          </Block>
        </Reveal>

        <Reveal className="lg:col-span-5" delay={60}>
          <Block
            title="Prices that keep themselves fresh"
            lede="Crypto from CoinGecko, equities from Yahoo Finance, refreshed every minute — once a position is on your ledger, you never touch its price again."
            className="h-full"
          >
            <LivePriceDemo />
          </Block>
        </Reveal>

        <Reveal className="lg:col-span-5" delay={0}>
          <Block
            title="A trade journal with three lenses"
            lede="Log a trade once, then read it three ways — the running tape, a per-ticker dossier, or a monthly postmortem."
            className="h-full"
          >
            <TradeLensDemo />
          </Block>
        </Reveal>

        <Reveal className="lg:col-span-7" delay={60}>
          <Block
            title="Privacy on a switch"
            lede="Your numbers are yours. Hide every value in the app with one tap of the eye — charts keep their shape, amounts go quiet."
            className="h-full"
          >
            <PrivacyDemo />
          </Block>
        </Reveal>

        <Reveal className="lg:col-span-6" delay={0}>
          <Block
            title="Statements in, positions out"
            lede="Upload a broker PDF and FolioBuddy reconciles units, cost and NAV against your existing positions — no duplicates, no retyping."
            className="h-full"
          >
            <StatementDemo />
          </Block>
        </Reveal>

        <Reveal className="lg:col-span-6" delay={60}>
          <Block
            title="Investors, stakes, shared money"
            lede="Track each person's stake, returns and history when you manage money for family — no second spreadsheet."
            className="h-full"
          >
            <StakesDemo />
          </Block>
        </Reveal>

        {/* Full-width showcase — the one shape no other row uses. */}
        <Reveal className="sm:col-span-2 lg:col-span-12" delay={0}>
          <Block
            title="News that knows what you own"
            lede="Headlines for your holdings, ranked by what they are — not when they posted. Company filings outrank fresh clickbait, five syndicated copies collapse into one story, official announcements earn their badge from the domain, and quiet days stay quiet."
            className="h-full lg:flex-row lg:items-center lg:gap-10 lg:[&>div:first-child]:max-w-sm lg:[&>div:first-child]:shrink-0"
          >
            <div className="min-w-0 lg:flex-1">
              <NewsDemo />
            </div>
          </Block>
        </Reveal>
      </div>

      <Reveal className="mt-6">
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {EXTRAS.map((extra) => (
            <li key={extra} className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-primary/60" aria-hidden="true" />
              {extra}
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}

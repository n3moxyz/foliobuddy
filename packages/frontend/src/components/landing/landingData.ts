// Deterministic illustrative data for the public landing page.
// Everything here is fake but plausible — no live API calls, no user data.

export interface SeriesPoint {
  /** 0..1 fraction along the x axis */
  t: number;
  /** Portfolio value in USD */
  value: number;
}

interface ControlPoint {
  t: number;
  /** Value in thousands of USD */
  k: number;
}

/** Cosine-interpolate control points into a dense series with a deterministic wiggle. */
function buildSeries(
  controls: ControlPoint[],
  samples: number,
  wiggleScale: number
): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    let upper = controls.findIndex((c) => c.t >= t);
    if (upper <= 0) upper = t <= controls[0].t ? 1 : controls.length - 1;
    const a = controls[upper - 1];
    const b = controls[upper];
    const span = b.t - a.t || 1;
    const local = Math.min(Math.max((t - a.t) / span, 0), 1);
    const eased = (1 - Math.cos(local * Math.PI)) / 2;
    const base = a.k + (b.k - a.k) * eased;
    // Deterministic texture so the line reads as market data, not a spline.
    const wiggle = (Math.sin(i * 1.7) * 1.4 + Math.sin(i * 0.53 + 2.1) * 1.1) * wiggleScale;
    // Taper the wiggle at both ends so start/end values stay exact.
    const taper = Math.min(1, Math.min(i, samples - 1 - i) / 6);
    points.push({ t, value: (base + wiggle * taper) * 1000 });
  }
  return points;
}

export const SERIES_SAMPLES = 121;

/** One illustrative year of portfolio value: +18.4%, one honest drawdown, new ATH at the end. */
export const PORTFOLIO_SERIES: SeriesPoint[] = buildSeries(
  [
    { t: 0, k: 411.6 },
    { t: 0.08, k: 418 },
    { t: 0.16, k: 428 },
    { t: 0.24, k: 436 },
    { t: 0.32, k: 449 },
    { t: 0.38, k: 456.2 },
    { t: 0.44, k: 438 },
    { t: 0.5, k: 412.4 },
    { t: 0.58, k: 425 },
    { t: 0.66, k: 438 },
    { t: 0.74, k: 449 },
    { t: 0.82, k: 462 },
    { t: 0.9, k: 478 },
    { t: 1, k: 487.2 },
  ],
  SERIES_SAMPLES,
  1
);

/** BTC over the same year, rebased to the same starting value: +10.4%, wilder ride. */
export const BENCHMARK_SERIES: SeriesPoint[] = buildSeries(
  [
    { t: 0, k: 411.6 },
    { t: 0.1, k: 432 },
    { t: 0.2, k: 415 },
    { t: 0.3, k: 441 },
    { t: 0.4, k: 462 },
    { t: 0.5, k: 428 },
    { t: 0.6, k: 415 },
    { t: 0.7, k: 441 },
    { t: 0.8, k: 458 },
    { t: 0.9, k: 449 },
    { t: 1, k: 454.5 },
  ],
  SERIES_SAMPLES,
  1.7
);

/** Month labels for the illustrative year (no live dates — the story is timeless). */
export const SERIES_MONTHS = [
  'Sep',
  'Oct',
  'Nov',
  'Dec',
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
];

export function monthLabelAt(t: number): string {
  const index = Math.min(SERIES_MONTHS.length - 1, Math.floor(t * SERIES_MONTHS.length));
  return SERIES_MONTHS[index];
}

/** Linear interpolation of a series value at fraction t of the x axis. */
export function valueAt(series: SeriesPoint[], t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  const scaled = clamped * (series.length - 1);
  const lower = Math.floor(scaled);
  const upper = Math.min(series.length - 1, lower + 1);
  const local = scaled - lower;
  return series[lower].value + (series[upper].value - series[lower].value) * local;
}

export interface ChartGeometry {
  path: string;
  areaPath: string;
  /** y pixel for a given fraction t */
  yAt: (t: number) => number;
  /** x pixel for a given fraction t */
  xAt: (t: number) => number;
  /** Fraction of total polyline arc length covered at x-fraction t (for stroke draw sync). */
  lengthFractionAt: (t: number) => number;
}

/** Project a series into SVG pixel space and precompute arc lengths for scroll-synced drawing. */
export function buildChartGeometry(
  series: SeriesPoint[],
  width: number,
  height: number,
  padTop: number,
  padBottom: number,
  min: number,
  max: number
): ChartGeometry {
  const usable = height - padTop - padBottom;
  const xAt = (t: number) => t * width;
  const yFor = (value: number) => padTop + (1 - (value - min) / (max - min)) * usable;

  const coords = series.map((p) => ({ x: xAt(p.t), y: yFor(p.value) }));
  const path = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)} ${c.y.toFixed(2)}`)
    .join(' ');
  const areaPath = `${path} L${width} ${height} L0 ${height} Z`;

  const cumulative: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i].x - coords[i - 1].x;
    const dy = coords[i].y - coords[i - 1].y;
    cumulative.push(cumulative[i - 1] + Math.hypot(dx, dy));
  }
  const total = cumulative[cumulative.length - 1] || 1;

  return {
    path,
    areaPath,
    xAt,
    yAt: (t: number) => yFor(valueAt(series, t)),
    lengthFractionAt: (t: number) => {
      const clamped = Math.min(Math.max(t, 0), 1);
      const scaled = clamped * (series.length - 1);
      const lower = Math.floor(scaled);
      const upper = Math.min(series.length - 1, lower + 1);
      const local = scaled - lower;
      const length = cumulative[lower] + (cumulative[upper] - cumulative[lower]) * local;
      return length / total;
    },
  };
}

export interface ScrollMilestone {
  id: string;
  /** Fraction along the chart where the annotation anchors (and appears). */
  anchor: number;
  title: string;
  detail: string;
}

export const SCROLL_MILESTONES: ScrollMilestone[] = [
  {
    id: 'snapshot',
    anchor: 0.16,
    title: 'Daily snapshot · 5:00 AM SGT',
    detail:
      'Every morning FolioBuddy records your whole portfolio — value, allocation, per-position P&L. The line is built from those snapshots, not from memory.',
  },
  {
    id: 'drawdown',
    anchor: 0.5,
    title: 'Drawdown from ATH −9.6%',
    detail:
      'Drawdowns are measured from your actual peak and shown plainly. Max drawdown, daily drawdown, distance from ATH — no varnish on red months.',
  },
  {
    id: 'benchmark',
    anchor: 0.62,
    title: 'vs BTC · ETH · S&P 500',
    detail:
      'Your return only means something next to the alternative. Overlay benchmarks to see whether the work is beating the simple trade.',
  },
  {
    id: 'ath',
    anchor: 0.92,
    title: 'New all-time high',
    detail:
      'A year later: +18.4%, one honest drawdown survived, and the full record of how you got here — every trade, every snapshot.',
  },
];

export interface HeroPosition {
  symbol: string;
  name: string;
  venue: string;
  /** Tailwind background class for the category dot */
  accentClass: string;
  price: number;
  /** Per-tick price drift amplitude */
  drift: number;
  changePct: number;
}

export const HERO_POSITIONS: HeroPosition[] = [
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    venue: 'Binance',
    accentClass: 'bg-crypto',
    price: 67240,
    drift: 42,
    changePct: 2.1,
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA',
    venue: 'IBKR',
    accentClass: 'bg-equities',
    price: 903.12,
    drift: 0.85,
    changePct: -0.8,
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    venue: 'Onchain',
    accentClass: 'bg-crypto',
    price: 158.4,
    drift: 0.6,
    changePct: 4.6,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    venue: 'Onchain',
    accentClass: 'bg-cash',
    price: 1.0,
    drift: 0,
    changePct: 0.0,
  },
];

export interface AllocationSlice {
  label: string;
  pct: number;
  /** CSS color for SVG strokes (category accent tokens) */
  color: string;
}

export const HERO_ALLOCATION: AllocationSlice[] = [
  { label: 'Crypto', pct: 54, color: 'hsl(var(--accent-crypto))' },
  { label: 'Equities', pct: 31, color: 'hsl(var(--accent-equities))' },
  { label: 'Cash', pct: 15, color: 'hsl(var(--accent-cash))' },
];

export const HERO_NET_WORTH = 487230;
export const HERO_YTD_PCT = 18.4;

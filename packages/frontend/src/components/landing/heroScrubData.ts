// Data and readouts for the landing hero's net worth scrub (HeroNetWorthScrub).
// The series is the landing page's own illustrative year (PORTFOLIO_CONTROLS),
// so the hero quotes the same drawdown and return as the scroll story below it.

import { buildSeries, monthLabelAt, PORTFOLIO_CONTROLS, SERIES_MONTHS } from './landingData';

/**
 * Points on the hero line: one a week. At 51 samples every control point lands
 * on a sample, so the drawn peak, trough and end are exactly the values the
 * landing copy quotes (−9.6% drawdown, +18.4% for the year).
 */
const HERO_SAMPLES = 51;
/** Less texture than the scroll story's line: a quieter shape at hero size. */
const HERO_WIGGLE = 0.5;

function heroValues(): number[] {
  const values = buildSeries(PORTFOLIO_CONTROLS, HERO_SAMPLES, HERO_WIGGLE).map((point) =>
    Math.round(point.value)
  );
  // Draw each control point exactly, with the texture only between them
  for (const control of PORTFOLIO_CONTROLS) {
    const index = control.t * (HERO_SAMPLES - 1);
    if (Number.isInteger(Math.round(index * 1e6) / 1e6)) {
      values[Math.round(index)] = Math.round(control.k * 1000);
    }
  }
  return values;
}

export const HERO_VALUES: number[] = heroValues();

export const HERO_LAST = HERO_VALUES.length - 1;
const HERO_START = HERO_VALUES[0];

/** The deepest fall from a running peak, and where it bottoms out. */
function maxDrawdown(values: number[]): { index: number; pct: number } {
  let peak = values[0];
  let worst = { index: 0, pct: 0 };
  values.forEach((value, index) => {
    peak = Math.max(peak, value);
    const pct = value / peak - 1;
    if (pct < worst.pct) worst = { index, pct };
  });
  return worst;
}

const drawdown = maxDrawdown(HERO_VALUES);
export const HERO_TROUGH = drawdown.index;
export const HERO_MDD = drawdown.pct;

/** The chart scales from zero: lift its floor so the year fills the plot. */
const PLOT_FLOOR = 392_000;
export const HERO_PLOT: number[] = HERO_VALUES.map((value) => value - PLOT_FLOOR);

export const HERO_AXIS = [SERIES_MONTHS[0], SERIES_MONTHS[SERIES_MONTHS.length - 1]] as const;

const money = (value: number) => `$${value.toLocaleString('en-GB')}`;
const pct = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value * 100).toFixed(1)}%`;

export interface HeroReadout {
  label: string;
  value: string;
  badge: string;
  tone: 'success' | 'danger';
}

/** What the headline says with the pointer on `day` (an index), or off the chart (`null`). */
export function heroReadout(day: number | null): HeroReadout {
  if (day === null) {
    return {
      label: 'Net Worth',
      value: money(HERO_VALUES[HERO_LAST]),
      badge: pct(HERO_VALUES[HERO_LAST] / HERO_START - 1),
      tone: 'success',
    };
  }
  const month = monthLabelAt(day / HERO_LAST);
  const value = money(HERO_VALUES[day]);
  if (day === HERO_TROUGH) {
    return {
      label: `${month} · Max drawdown`,
      value,
      badge: `${pct(HERO_MDD)} MDD`,
      tone: 'danger',
    };
  }
  const change = HERO_VALUES[day] / HERO_START - 1;
  return {
    label: day === HERO_LAST ? `${month} · All-time high` : month,
    value,
    badge: pct(change),
    tone: change >= 0 ? 'success' : 'danger',
  };
}

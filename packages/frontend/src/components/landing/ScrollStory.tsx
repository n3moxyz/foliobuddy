import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { BRAND_COLORS, PORTFOLIO_LINE_COLOR } from '@/lib/chartColors';
import { cn, formatCurrency } from '@/lib/utils';
import {
  BENCHMARK_SERIES,
  buildChartGeometry,
  monthLabelAt,
  PORTFOLIO_SERIES,
  SCROLL_MILESTONES,
  SERIES_MONTHS,
  valueAt,
} from './landingData';
import { usePrefersReducedMotion, useScrollProgress } from './useLandingMotion';

const CHART_WIDTH = 1000;
const CHART_HEIGHT = 420;
const PAD_TOP = 48;
const PAD_BOTTOM = 44;

/** Fraction of scroll progress at which the line finishes drawing; the rest is dwell. */
const DRAW_END = 0.94;
/** The benchmark line draws between these tip fractions (matches the
    'benchmark' milestone anchor in landingData so caption and line sync). */
const BENCH_START = 0.62;
const BENCH_END = 0.9;

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * The second signature moment: a year of portfolio history that draws itself as
 * you scroll, annotated with the moments FolioBuddy actually records. Scrubs
 * forwards and backwards with the scroll position; hover moves the readout.
 */
export function ScrollStory() {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const rawProgress = useScrollProgress(containerRef);
  const progress = reduced ? 1 : rawProgress;
  const [hoverT, setHoverT] = useState<number | null>(null);

  const { portfolio, benchmark } = useMemo(() => {
    const values = [...PORTFOLIO_SERIES, ...BENCHMARK_SERIES].map((p) => p.value);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = (hi - lo) * 0.08;
    return {
      min: lo - pad,
      max: hi + pad,
      portfolio: buildChartGeometry(
        PORTFOLIO_SERIES,
        CHART_WIDTH,
        CHART_HEIGHT,
        PAD_TOP,
        PAD_BOTTOM,
        lo - pad,
        hi + pad
      ),
      benchmark: buildChartGeometry(
        BENCHMARK_SERIES,
        CHART_WIDTH,
        CHART_HEIGHT,
        PAD_TOP,
        PAD_BOTTOM,
        lo - pad,
        hi + pad
      ),
    };
  }, []);

  // The drawn tip moves through x-fraction space; stroke offset follows arc length
  // so the visible stroke end and the tip dot never drift apart on steep segments.
  const tipT = clamp01(progress / DRAW_END);
  // Derived from tipT (not raw progress) so the benchmark line starts drawing at
  // the exact moment the tip crosses the benchmark milestone's anchor.
  const benchT = clamp01((tipT - BENCH_START) / (BENCH_END - BENCH_START));

  // Readout follows hover when present (and only over drawn track), else the tip.
  const readoutT = hoverT !== null ? Math.min(hoverT, tipT) : tipT;
  const readoutValue = valueAt(PORTFOLIO_SERIES, readoutT);
  const readoutX = portfolio.xAt(readoutT);
  const readoutY = portfolio.yAt(readoutT);

  const activeMilestones = SCROLL_MILESTONES.filter((m) => tipT >= m.anchor);
  const currentMilestone = activeMilestones[activeMilestones.length - 1] ?? null;

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHoverT(clamp01((event.clientX - rect.left) / rect.width));
  };

  return (
    <section aria-labelledby="scroll-story-heading">
      <p className="sr-only">
        Illustration: one year of a portfolio recorded by FolioBuddy. Once a day, at an hour you
        choose, a snapshot records the whole portfolio, and those snapshots build the value line.
        Drawdowns are measured plainly from the peak — this example year includes a 9.6 percent
        drawdown from the all-time high. Benchmarks such as Bitcoin, Ethereum and the S&amp;P 500
        can be overlaid for comparison, and the illustrative year ends at a new all-time high, up
        18.4 percent.
      </p>

      <div ref={containerRef} className={cn(!reduced && 'h-[320vh]')}>
        <div
          className={cn(
            'mx-auto flex max-w-6xl flex-col justify-center px-4 sm:px-6',
            !reduced && 'sticky top-0 h-screen'
          )}
        >
          <div className="mb-6 sm:mb-10">
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              The snapshot system
            </div>
            <h2
              id="scroll-story-heading"
              className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl"
            >
              One year. One honest line.
            </h2>
          </div>

          <div className="relative" aria-hidden="true">
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              className="w-full touch-pan-y select-none"
              onPointerMove={onPointerMove}
              onPointerLeave={() => setHoverT(null)}
            >
              {/* Horizontal gridlines, muted like the app's charts */}
              {[0.25, 0.5, 0.75].map((f) => {
                const y = PAD_TOP + (CHART_HEIGHT - PAD_TOP - PAD_BOTTOM) * f;
                return (
                  <line
                    key={f}
                    x1="0"
                    x2={CHART_WIDTH}
                    y1={y}
                    y2={y}
                    stroke="hsl(var(--border))"
                    strokeWidth="1"
                    strokeDasharray="2 6"
                  />
                );
              })}

              {/* Month ticks. SVG font-size is in viewBox units, so mobile needs a
                  larger size (and fewer labels) to stay legible once scaled down. */}
              {SERIES_MONTHS.map((label, i) => (
                <text
                  key={`${label}-${i}`}
                  x={(i / SERIES_MONTHS.length) * CHART_WIDTH + 6}
                  y={CHART_HEIGHT - 10}
                  className={cn(
                    'fill-current font-mono text-[26px] text-muted-foreground sm:text-[11px]',
                    i % 2 === 1 && 'hidden sm:block'
                  )}
                  opacity={0.8}
                >
                  {label}
                </text>
              ))}

              {/* Benchmark (BTC) — dashed, draws after its milestone */}
              {benchT > 0 && (
                <path
                  d={benchmark.path}
                  fill="none"
                  stroke={BRAND_COLORS.btc}
                  strokeWidth="1.5"
                  strokeDasharray="0.014 0.008"
                  strokeLinecap="round"
                  pathLength={1}
                  opacity={0.85}
                  style={{
                    // The stroke is already dashed, so a dashoffset draw would fight
                    // the dash pattern — wipe it in left-to-right with a clip instead.
                    clipPath: `inset(0 ${(1 - benchT) * 100}% 0 0)`,
                  }}
                />
              )}

              {/* Portfolio line, scrubbed by scroll via arc-length offset */}
              <path
                d={portfolio.areaPath}
                fill="url(#story-fill)"
                style={{ clipPath: `inset(0 ${(1 - tipT) * 100}% 0 0)` }}
              />
              <path
                d={portfolio.path}
                fill="none"
                stroke={PORTFOLIO_LINE_COLOR}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                strokeDasharray="1"
                strokeDashoffset={1 - portfolio.lengthFractionAt(tipT)}
              />
              <defs>
                <linearGradient id="story-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PORTFOLIO_LINE_COLOR} stopOpacity="0.16" />
                  <stop offset="100%" stopColor={PORTFOLIO_LINE_COLOR} stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Milestone anchors */}
              {SCROLL_MILESTONES.map((milestone) => {
                const visible = tipT >= milestone.anchor;
                const x = portfolio.xAt(milestone.anchor);
                const y = portfolio.yAt(milestone.anchor);
                return (
                  <g
                    key={milestone.id}
                    className="transition-opacity duration-300"
                    opacity={visible ? 1 : 0}
                  >
                    <line
                      x1={x}
                      x2={x}
                      y1={y + 8}
                      y2={CHART_HEIGHT - PAD_BOTTOM + 12}
                      stroke="hsl(var(--muted-foreground))"
                      strokeWidth="1"
                      strokeDasharray="1 4"
                      opacity={0.5}
                    />
                    <circle cx={x} cy={y} r="4" fill="hsl(var(--background))" />
                    <circle
                      cx={x}
                      cy={y}
                      r="4"
                      fill="none"
                      stroke={PORTFOLIO_LINE_COLOR}
                      strokeWidth="2"
                    />
                  </g>
                );
              })}

              {/* Crosshair + readout */}
              <g className="transition-opacity duration-200" opacity={tipT > 0.02 ? 1 : 0}>
                <line
                  x1={readoutX}
                  x2={readoutX}
                  y1={PAD_TOP - 16}
                  y2={CHART_HEIGHT - PAD_BOTTOM}
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth="1"
                  opacity={0.35}
                />
                <circle cx={readoutX} cy={readoutY} r="5" fill={PORTFOLIO_LINE_COLOR} />
                <circle
                  cx={readoutX}
                  cy={readoutY}
                  r="9"
                  fill="none"
                  stroke={PORTFOLIO_LINE_COLOR}
                  strokeWidth="1"
                  opacity="0.4"
                />
              </g>
            </svg>

            {/* Value readout chip, mirrored in DOM for crisp text */}
            <div
              className="pointer-events-none absolute -top-2 rounded-md border bg-card px-2.5 py-1.5 font-mono text-xs tabular-nums shadow-sm transition-opacity duration-200"
              style={{
                left: `${(readoutX / CHART_WIDTH) * 100}%`,
                transform: `translateX(${readoutX > CHART_WIDTH * 0.8 ? '-100%' : '-50%'})`,
                opacity: tipT > 0.02 ? 1 : 0,
              }}
            >
              <span className="text-muted-foreground">{monthLabelAt(readoutT)}</span>{' '}
              <span className="font-medium">{formatCurrency(readoutValue, 'USD', 0)}</span>
            </div>

            {/* Benchmark legend appears with the benchmark line (desktop only —
                on mobile it collides with the value readout chip) */}
            <div
              className="pointer-events-none absolute right-0 top-0 hidden items-center gap-2 font-mono text-[11px] text-muted-foreground transition-opacity duration-300 sm:flex"
              style={{ opacity: benchT > 0 ? 1 : 0 }}
            >
              <span
                className="inline-block h-0 w-5 border-t-2 border-dashed"
                style={{ borderColor: BRAND_COLORS.btc }}
              />
              BTC, same year
            </div>
          </div>

          {/* Milestone caption rail (scroll mode only; reduced motion gets the static grid) */}
          {!reduced && (
            <div className="relative mt-6 min-h-[88px] sm:mt-8" aria-hidden="true">
              {SCROLL_MILESTONES.map((milestone) => (
                <div
                  key={milestone.id}
                  className={cn(
                    'transition-[opacity,transform] duration-300',
                    currentMilestone?.id === milestone.id
                      ? 'translate-y-0 opacity-100'
                      : 'pointer-events-none absolute inset-x-0 top-0 -translate-y-1 opacity-0'
                  )}
                >
                  <div className="font-mono text-xs font-medium uppercase tracking-wider text-primary">
                    {milestone.title}
                  </div>
                  <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                    {milestone.detail}
                  </p>
                </div>
              ))}
              {!currentMilestone && (
                <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Keep scrolling — this is a year of a portfolio, rebuilt from FolioBuddy's daily
                  snapshots.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Reduced motion / no-JS style fallback captions, rendered statically */}
      {reduced && (
        <div className="mx-auto grid max-w-6xl gap-6 px-4 pb-8 sm:grid-cols-2 sm:px-6">
          {SCROLL_MILESTONES.map((milestone) => (
            <div key={milestone.id}>
              <div className="font-mono text-xs font-medium uppercase tracking-wider text-primary">
                {milestone.title}
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {milestone.detail}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAnimatedNumber } from '@/hooks/useAnimatedNumber';
import { cn, formatCurrency, formatPrice } from '@/lib/utils';
import {
  buildChartGeometry,
  HERO_ALLOCATION,
  HERO_NET_WORTH,
  HERO_POSITIONS,
  HERO_YTD_PCT,
  PORTFOLIO_SERIES,
} from './landingData';
import { usePointerTilt, usePrefersReducedMotion } from './useLandingMotion';

const SPARK_WIDTH = 320;
const SPARK_HEIGHT = 96;

/** The hero sparkline: the last illustrative year, drawn in on mount. */
function HeroSparkline({ animate }: { animate: boolean }) {
  const geometry = useMemo(() => {
    const values = PORTFOLIO_SERIES.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.12;
    return buildChartGeometry(
      PORTFOLIO_SERIES,
      SPARK_WIDTH,
      SPARK_HEIGHT,
      6,
      4,
      min - pad,
      max + pad
    );
  }, []);

  return (
    <svg
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      className="h-full w-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="hero-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.22" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={geometry.areaPath}
        fill="url(#hero-spark-fill)"
        className={cn(animate && 'landing-fade-late')}
      />
      <path
        d={geometry.path}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className={cn(animate && 'landing-draw-line')}
      />
    </svg>
  );
}

/** Allocation donut with segments that sweep in, matching the app's category accents. */
function HeroDonut({ drawn }: { drawn: boolean }) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0" aria-hidden="true">
      {HERO_ALLOCATION.map((slice, index) => {
        const length = (slice.pct / 100) * circumference;
        // Leave a hairline gap between segments, like the app's donuts.
        const gap = 2.5;
        const segment = (
          <circle
            key={slice.label}
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke={slice.color}
            strokeWidth="9"
            strokeDasharray={
              drawn ? `${Math.max(length - gap, 0)} ${circumference}` : `0 ${circumference}`
            }
            strokeDashoffset={-offset}
            transform="rotate(-90 40 40)"
            className="landing-donut-segment"
            style={{ transitionDelay: `${350 + index * 70}ms` }}
          />
        );
        offset += length;
        return segment;
      })}
      <text
        x="40"
        y="44"
        textAnchor="middle"
        className="fill-foreground font-mono text-[13px] font-medium"
      >
        54%
      </text>
    </svg>
  );
}

/** One mock position row with a softly ticking live price. */
function HeroPositionRow({
  position,
  tick,
}: {
  position: (typeof HERO_POSITIONS)[number];
  tick: number;
}) {
  // Deterministic pseudo-random walk: same visual on every visit.
  const drifted = position.price + Math.sin(tick * 0.9 + position.price) * position.drift;
  const displayPrice = useAnimatedNumber(drifted, 700);
  const flat = position.changePct === 0;
  const positive = position.changePct > 0;

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', position.accentClass)} />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-tight">{position.symbol}</div>
          <div className="truncate text-[11px] leading-tight text-muted-foreground">
            {position.venue}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-[13px] leading-tight tabular-nums">
          {formatPrice(displayPrice)}
        </div>
        <div
          className={cn(
            'font-mono text-[11px] leading-tight tabular-nums',
            flat ? 'text-muted-foreground' : positive ? 'text-profit' : 'text-loss'
          )}
        >
          {flat ? '' : positive ? '▲ ' : '▼ '}
          {Math.abs(position.changePct).toFixed(1)}%
        </div>
      </div>
    </div>
  );
}

/**
 * The landing signature: a self-running miniature of the real dashboard,
 * tilted in 3D and following the pointer. Purely illustrative — hidden from
 * assistive tech; the surrounding copy carries the meaning.
 */
export function HeroDashboard() {
  const tiltRef = useRef<HTMLDivElement>(null);
  const transform = usePointerTilt(tiltRef, 6);
  const reduced = usePrefersReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [tick, setTick] = useState(0);

  const netWorth = useAnimatedNumber(mounted ? HERO_NET_WORTH : 0, 1400);

  useEffect(() => {
    // Defer one frame so entrance transitions run instead of applying instantly.
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const interval = window.setInterval(() => setTick((t) => t + 1), 2600);
    return () => window.clearInterval(interval);
  }, [reduced]);

  const animate = mounted && !reduced;

  return (
    <div ref={tiltRef} className="group relative" aria-hidden="true">
      <div
        className="relative rounded-lg border bg-card shadow-2xl shadow-black/40"
        style={{ transform, transformStyle: 'preserve-3d', willChange: 'transform' }}
      >
        {/* Window chrome: quietly signals "this is the product" */}
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="" className="h-4 w-4 rounded-[22%]" draggable={false} />
            <span className="text-[11px] font-medium text-muted-foreground">Dashboard</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-profit opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-profit" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Live
            </span>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {/* Net worth hero */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Net Worth
              </div>
              <div className="mt-1 font-mono text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">
                {formatCurrency(reduced ? HERO_NET_WORTH : netWorth, 'USD', 0)}
              </div>
              <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-profit px-2 py-0.5 font-mono text-[11px] tabular-nums text-profit">
                ▲ +{HERO_YTD_PCT}% YTD
              </div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <HeroDonut drawn={reduced || mounted} />
              <div className="flex items-center gap-2">
                {HERO_ALLOCATION.map((slice) => (
                  <span
                    key={slice.label}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground"
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: slice.color }}
                    />
                    {slice.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Sparkline */}
          <div className="mt-4 h-24">
            <HeroSparkline animate={animate} />
          </div>

          {/* Positions */}
          <div className="mt-3 divide-y divide-border/60 border-t pt-1">
            {HERO_POSITIONS.map((position) => (
              <HeroPositionRow key={position.symbol} position={position} tick={tick} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

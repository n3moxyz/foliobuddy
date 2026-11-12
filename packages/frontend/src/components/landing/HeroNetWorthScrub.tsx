import { useMemo, useState } from 'react';
import {
  History,
  LayoutDashboard,
  Newspaper,
  Settings,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { Stage } from './stageshow-kit/stage';
import { Bar, Window } from './stageshow-kit/window';
import { Chart, chartPoints } from './stageshow-kit/chart';
import { Badge } from './stageshow-kit/controls/Badge';
import { Roll } from './stageshow-kit/motion/Roll';
import type { Act } from './stageshow-kit/act';
import { HERO_AXIS, HERO_LAST, HERO_PLOT, HERO_TROUGH, heroReadout } from './heroScrubData';
import './heroNetWorthScrub.css';

// The landing hero: a miniature of the dashboard's net worth chart, scrubbed
// by a pointer. Built with Benji Taylor's Stageshow kit (MIT, vendored in
// ./stageshow-kit). Rehearsal notes: HeroNetWorthScrub.REHEARSAL.md.
//
// Beats: the pointer comes onto the line; the headline reads that month. One
// stroke down into the drawdown, where the label names it and the badge shows
// the drop from the peak. A second stroke up to the all-time high, which holds.
// The pointer leaves and the headline is the live value again: the figure it
// rested on, so nothing rewinds.

// Only the readout is React state, and it changes only when the nearest day
// does. The hairline and dot follow the pointer every frame through refs
// (ScrubMarker), per the per-frame motion contract in docs/UI-CONTRACTS.md.
type Scene = { day: number | null };

type Layout = 'wide' | 'compact';

interface MarkerAt {
  x: number;
  y: number;
  day: number | null;
  layout: Layout | null;
}

/** Moves the hairline and dot by writing their style; never re-renders. */
class ScrubMarker {
  hair: HTMLSpanElement | null = null;
  dot: HTMLSpanElement | null = null;
  plot: HTMLDivElement | null = null;
  at: MarkerAt = { x: 0, y: 0, day: null, layout: null };
  private table: { path: SVGPathElement; xs: number[]; ys: number[] } | null = null;

  /** The y of the drawn curve at x, from points sampled once per path. */
  private curveY(x: number): number | null {
    const path = this.plot?.querySelector<SVGPathElement>('.ss-chart__line');
    if (!path || typeof path.getTotalLength !== 'function') return null;
    if (this.table?.path !== path) {
      const length = path.getTotalLength();
      const steps = Math.max(2, Math.ceil(length / 2));
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i <= steps; i++) {
        const point = path.getPointAtLength((length * i) / steps);
        xs.push(point.x);
        ys.push(point.y);
      }
      this.table = { path, xs, ys };
    }
    const { xs, ys } = this.table;
    let lo = 0;
    let hi = xs.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] < x) lo = mid;
      else hi = mid;
    }
    const span = xs[hi] - xs[lo] || 1;
    return ys[lo] + ((ys[hi] - ys[lo]) * (x - xs[lo])) / span;
  }

  /** Puts the hairline at the pointer and the dot on the curve under it. */
  place(x: number, day: number, layout: Layout, fallbackY: number) {
    this.at = { x, y: this.curveY(x) ?? fallbackY, day, layout };
    if (this.hair) this.hair.style.left = `${this.at.x}px`;
    if (this.dot) {
      this.dot.style.left = `${this.at.x}px`;
      this.dot.style.top = `${this.at.y}px`;
    }
  }
}

const DESIGN = {
  wide: { plotW: 348, plotH: 150 },
  compact: { plotW: 294, plotH: 124 },
} as const;

const REST = { wide: { x: 384, y: 138 }, compact: { x: 250, y: 116 } };

const NAV = [LayoutDashboard, Wallet, TrendingUp, Newspaper, History, Users];

// Placeholder metric cards: label and value bar widths, inside a card's 80px
const STATS = [
  [52, 76],
  [38, 58],
  [46, 68],
] as const;

function createScript(marker: ScrubMarker) {
  return async function script(a: Act<Scene>) {
    await a.wait(800);
    const layout: Layout = a.layout === 'compact' ? 'compact' : 'wide';
    const box = a.rect('plot');
    const { plotW, plotH } = DESIGN[layout];
    const pts = chartPoints({ data: HERO_PLOT, width: plotW, height: plotH, dot: false });
    const at = (i: number) => ({ x: box.x + pts[i].x, y: box.y + pts[i].y + 22 });
    const nearest = (x: number) => {
      let n = 0;
      for (let i = 1; i < pts.length; i++) {
        if (Math.abs(pts[i].x - x) < Math.abs(pts[n].x - x)) n = i;
      }
      return n;
    };
    // The day the readout shows: state changes only when this does
    let shown: number | null = null;
    const show = (day: number | null) => {
      if (day === shown) return;
      shown = day;
      a.put({ day });
    };
    // Snap the marker onto a day's own point
    const settle = (day: number) => {
      show(day);
      marker.place(pts[day].x, day, layout, pts[day].y);
    };
    // One eased stroke, straight as a hand runs; the readout is the point nearest the pointer
    const stroke = (to: number, duration: number) =>
      a.move(at(to), {
        duration,
        path: (e, from, end) => ({
          x: from.x + (end.x - from.x) * e,
          y: from.y + (end.y - from.y) * e,
        }),
        onMove: (pt) => {
          const x = Math.max(0, Math.min(box.width, pt.x - box.x));
          const day = nearest(x);
          show(day);
          marker.place(x, day, layout, pts[day].y);
        },
      });

    a.mark('hover');
    const entry = Math.round(HERO_LAST * 0.24);
    await a.move(at(entry), { duration: 700 });
    settle(entry);
    await a.wait(600);

    a.mark('trough');
    await stroke(HERO_TROUGH, 1100);
    settle(HERO_TROUGH);
    await a.wait(1600);

    a.mark('peak');
    await stroke(HERO_LAST, 1300);
    settle(HERO_LAST);
    await a.wait(2000);

    // Off the plot and back to rest: the readout lets go as the pointer crosses its edge
    a.mark('leave');
    let gone = false;
    await a.move(REST[layout], {
      duration: 700,
      onMove: (pt) => {
        const out =
          pt.x < box.x || pt.x > box.x + box.width || pt.y < box.y || pt.y > box.y + box.height;
        if (!gone && out) {
          gone = true;
          show(null);
        }
      },
    });
    show(null);
    await a.wait(700);
  };
}

function Rail() {
  return (
    <nav className="fbn-rail">
      {NAV.map((Icon, i) => (
        <span key={i} className="fbn-nav" data-active={i === 0 || undefined}>
          <Icon size={16} strokeWidth={2} />
        </span>
      ))}
      <span className="fbn-nav fbn-nav--end">
        <Settings size={16} strokeWidth={2} />
      </span>
    </nav>
  );
}

/**
 * Purely illustrative, like the hero it replaced: hidden from assistive tech,
 * the surrounding copy carries the meaning. Reduced motion shows the poster
 * (the drawdown beat) as a still.
 */
export function HeroNetWorthScrub() {
  // One marker per hero; it also remembers where the hairline and dot last
  // were, so they fade out in place
  const [marker] = useState(() => new ScrubMarker());
  const script = useMemo(() => createScript(marker), [marker]);

  return (
    <div className="fbn" aria-hidden="true">
      <Stage<Scene>
        width={500}
        height={380}
        compact={{ below: 480, width: 358, height: 340 }}
        fill
        theme="dark"
        initial={{ day: null }}
        poster={{ day: HERO_TROUGH }}
        script={script}
        cursor={{ at: REST }}
      >
        {(s, _rect, layout) => {
          const compact = layout === 'compact';
          const { plotW, plotH } = DESIGN[compact ? 'compact' : 'wide'];
          const pts = chartPoints({ data: HERO_PLOT, width: plotW, height: plotH, dot: false });
          const r = heroReadout(s.day);
          const view: Layout = compact ? 'compact' : 'wide';
          // A new day (or layout) starts on that day's point; the scrub then
          // moves the marker between renders
          if (s.day !== null && (marker.at.day !== s.day || marker.at.layout !== view)) {
            marker.at = { x: pts[s.day].x, y: pts[s.day].y, day: s.day, layout: view };
          }
          const on = s.day !== null;
          const mark = marker.at;
          const kind =
            mark.day === HERO_TROUGH ? 'mdd' : mark.day === HERO_LAST ? 'ath' : undefined;
          return (
            // The app's collapsed 72px rail on desktop; the mobile app has no rail
            <Window
              title="Dashboard"
              className="fbn-win"
              sidebarWidth={72}
              sidebar={compact ? undefined : <Rail />}
            >
              <div className="fbn-body">
                <div className="fbn-head">
                  <div className="fbn-top" style={{ width: plotW }}>
                    <div className="fbn-label">
                      <Roll variant="fade">{r.label}</Roll>
                    </div>
                    <Badge tone={r.tone} className="fbn-badge">
                      <Roll variant="fade">{r.badge}</Roll>
                    </Badge>
                  </div>
                  <div className="fbn-value">
                    <Roll stagger={22}>{r.value}</Roll>
                  </div>
                </div>
                <div
                  ref={(el) => {
                    marker.plot = el;
                  }}
                  className="fbn-plot"
                  data-target="plot"
                  data-cursor="crosshair"
                  style={{ width: plotW, height: plotH }}
                >
                  <Chart data={HERO_PLOT} width={plotW} height={plotH} dot={false} />
                  <span
                    className="fbn-mile"
                    data-kind="mdd"
                    style={{ left: pts[HERO_TROUGH].x, top: pts[HERO_TROUGH].y }}
                  />
                  <span
                    className="fbn-mile"
                    data-kind="ath"
                    style={{ left: pts[HERO_LAST].x, top: pts[HERO_LAST].y }}
                  />
                  <span
                    ref={(el) => {
                      marker.hair = el;
                    }}
                    className="fbn-hair"
                    data-on={on || undefined}
                    style={{ left: mark.x }}
                  />
                  <span
                    ref={(el) => {
                      marker.dot = el;
                    }}
                    className="fbn-dot"
                    data-on={on || undefined}
                    data-kind={kind}
                    style={{ left: mark.x, top: mark.y }}
                  />
                </div>
                <div className="fbn-axis" style={{ width: plotW }}>
                  <span>{HERO_AXIS[0]}</span>
                  <span>{HERO_AXIS[1]}</span>
                </div>
                <div className="fbn-stats">
                  {STATS.slice(0, compact ? 2 : 3).map(([label, value], i) => (
                    <div key={i} className="fbn-stat">
                      <Bar w={label} h={6} tone={3} />
                      <Bar w={value} h={10} tone={4} />
                    </div>
                  ))}
                </div>
              </div>
            </Window>
          );
        }}
      </Stage>
    </div>
  );
}

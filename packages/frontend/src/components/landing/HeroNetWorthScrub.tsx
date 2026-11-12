import { useRef } from 'react';
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

type Scene = { day: number | null; x: number | null };

const DESIGN = {
  wide: { plotW: 348, plotH: 150 },
  compact: { plotW: 294, plotH: 124 },
} as const;

const REST = { wide: { x: 384, y: 138 }, compact: { x: 250, y: 116 } };

const NAV = [LayoutDashboard, Wallet, TrendingUp, Newspaper, History, Users];

const STATS = [
  [52, 84],
  [38, 62],
  [46, 74],
] as const;

async function script(a: Act<Scene>) {
  await a.wait(800);
  const layout = a.layout === 'compact' ? 'compact' : 'wide';
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
        a.put({ day: nearest(x), x });
      },
    });

  a.mark('hover');
  const entry = Math.round(HERO_LAST * 0.24);
  await a.move(at(entry), { duration: 700 });
  a.put({ day: entry, x: pts[entry].x });
  await a.wait(600);

  a.mark('trough');
  await stroke(HERO_TROUGH, 1100);
  a.put({ day: HERO_TROUGH, x: pts[HERO_TROUGH].x });
  await a.wait(1600);

  a.mark('peak');
  await stroke(HERO_LAST, 1300);
  a.put({ day: HERO_LAST, x: pts[HERO_LAST].x });
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
        a.put({ day: null, x: null });
      }
    },
  });
  if (!gone) a.put({ day: null, x: null });
  await a.wait(700);
}

/** The y of the drawn line at x: a short search along the path's length. */
function yOn(path: SVGPathElement | null | undefined, x: number) {
  if (!path || typeof path.getTotalLength !== 'function') return null;
  let lo = 0;
  let hi = path.getTotalLength();
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (path.getPointAtLength(mid).x < x) lo = mid;
    else hi = mid;
  }
  return path.getPointAtLength(hi).y;
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
  const plot = useRef<HTMLDivElement>(null);
  // Where the hairline and dot last were, so they fade out in place
  const last = useRef<{ x: number; y: number; kind?: string }>({ x: 0, y: 0 });

  return (
    <div className="fbn" aria-hidden="true">
      <Stage<Scene>
        width={500}
        height={380}
        compact={{ below: 480, width: 358, height: 340 }}
        fill
        theme="dark"
        initial={{ day: null, x: null }}
        poster={{ day: HERO_TROUGH, x: null }}
        script={script}
        cursor={{ at: REST }}
      >
        {(s, _rect, layout) => {
          const compact = layout === 'compact';
          const { plotW, plotH } = DESIGN[compact ? 'compact' : 'wide'];
          const pts = chartPoints({ data: HERO_PLOT, width: plotW, height: plotH, dot: false });
          const r = heroReadout(s.day);
          const hx = s.x ?? (s.day === null ? null : pts[s.day].x);
          const hy =
            hx === null
              ? null
              : (yOn(plot.current?.querySelector<SVGPathElement>('.ss-chart__line'), hx) ??
                pts[s.day ?? 0].y);
          const on = s.day !== null && hx !== null && hy !== null;
          if (on) {
            last.current = {
              x: hx,
              y: hy,
              kind: s.day === HERO_TROUGH ? 'mdd' : s.day === HERO_LAST ? 'ath' : undefined,
            };
          }
          const mark = last.current;
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
                  ref={plot}
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
                  <span className="fbn-hair" data-on={on || undefined} style={{ left: mark.x }} />
                  <span
                    className="fbn-dot"
                    data-on={on || undefined}
                    data-kind={mark.kind}
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

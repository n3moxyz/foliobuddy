import type { PortfolioMilestone } from '@/lib/portfolioHistory';

type MilestoneKind = PortfolioMilestone['kind'];

/** Estimated advance of one character of the 11px label, rounded up so boxes never undercount. */
const CHAR_WIDTH = 6.6;
/** One label line, also the step when a label moves to avoid another. */
export const LABEL_HEIGHT = 14;
/** Space between a marker and the centre of a label above or below it. */
const LABEL_GAP = 13;
/** Space between a marker and a label set beside it. */
const SIDE_GAP = 8;
/** Clear space kept between a label and the 2px chart line. */
export const LINE_CLEARANCE = 3;
/** Half the width of a marker: a 4px dot plus its 2px ring, with 1px to spare. */
const MARKER_RADIUS = 7;
/** How many lines a label may move on one side of its point. */
const MAX_STEPS = 6;
/** Labels claim space in this order, so the high and the deepest drawdown keep their spots. */
const PRIORITY: Record<MilestoneKind, number> = { ath: 0, mdd: 1, daily: 2, live: 3 };

export interface Point {
  x: number;
  y: number;
}

export interface PlotArea {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface LabelRequest {
  kind: MilestoneKind;
  text: string;
  /** The marker's position in SVG pixels. */
  x: number;
  y: number;
  /** The end-of-line value owns the right of the last point. */
  isLast: boolean;
}

export interface PlacedLabel {
  kind: MilestoneKind;
  text: string;
  /** Left edge of the label, drawn with `text-anchor="start"`. */
  x: number;
  /** Vertical centre of the label. */
  y: number;
  width: number;
}

/** What a label must stay clear of besides the other labels. */
export interface LabelObstacles {
  /** The chart line's data points, in order of x. The layout traces the curve between them. */
  line: Point[];
  /** Every milestone marker on the chart. */
  markers: Point[];
}

/** The estimated drawn width of a label's text. */
export const labelWidth = (text: string) => text.length * CHAR_WIDTH;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

function overlaps(a: PlacedLabel, b: PlacedLabel) {
  return a.x < b.x + b.width && b.x < a.x + a.width && Math.abs(a.y - b.y) < LABEL_HEIGHT;
}

/** The tangent at each point of d3's `curveMonotoneX`, the curve Recharts draws for `type="monotone"`. */
function monotoneTangents(line: Point[]): number[] {
  const slope = (a: Point, b: Point) => (b.x === a.x ? 0 : (b.y - a.y) / (b.x - a.x));
  const last = line.length - 1;
  if (last < 1) return line.map(() => 0);
  if (last === 1) return [slope(line[0], line[1]), slope(line[0], line[1])];
  const sign = (value: number) => (value < 0 ? -1 : 1);
  const tangents = line.map((point, index) => {
    if (index === 0 || index === last) return 0;
    const previous = line[index - 1];
    const next = line[index + 1];
    const s0 = slope(previous, point);
    const s1 = slope(point, next);
    const h0 = point.x - previous.x;
    const h1 = next.x - point.x;
    const p = (s0 * h1 + s1 * h0) / (h0 + h1);
    return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
  });
  tangents[0] = (3 * slope(line[0], line[1]) - tangents[1]) / 2;
  tangents[last] = (3 * slope(line[last - 1], line[last]) - tangents[last - 1]) / 2;
  return tangents;
}

/** Most pixels between two traced points on a stretch of the curve. */
const TRACE_STEP = 4;

/**
 * The drawn curve as a dense polyline. Between two data points the monotone curve can bow
 * several pixels away from the straight line, which matters when a period has few points.
 */
export function traceMonotoneLine(line: Point[]): Point[] {
  if (line.length < 2) return line;
  const tangents = monotoneTangents(line);
  const traced: Point[] = [line[0]];
  for (let index = 0; index < line.length - 1; index++) {
    const { x: x0, y: y0 } = line[index];
    const { x: x1, y: y1 } = line[index + 1];
    const third = (x1 - x0) / 3;
    const c0 = y0 + third * tangents[index];
    const c1 = y1 - third * tangents[index + 1];
    const steps = Math.min(16, Math.max(1, Math.ceil((x1 - x0) / TRACE_STEP)));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const u = 1 - t;
      traced.push({
        x: x0 + (x1 - x0) * t,
        y: u * u * u * y0 + 3 * u * u * t * c0 + 3 * u * t * t * c1 + t * t * t * y1,
      });
    }
  }
  return traced;
}

/** Whether the traced line passes through the label's box or within the clearance of it. */
function crossesLine(label: PlacedLabel, traced: Point[]) {
  const top = label.y - LABEL_HEIGHT / 2 - LINE_CLEARANCE;
  const bottom = label.y + LABEL_HEIGHT / 2 + LINE_CLEARANCE;
  const left = label.x - LINE_CLEARANCE;
  const right = label.x + label.width + LINE_CLEARANCE;
  const yAt = (a: Point, b: Point, x: number) =>
    b.x === a.x ? a.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  for (let index = 0; index < traced.length - 1; index++) {
    const a = traced[index];
    const b = traced[index + 1];
    if (b.x < left || a.x > right) continue;
    const ya = yAt(a, b, Math.max(a.x, left));
    const yb = yAt(a, b, Math.min(b.x, right));
    if (Math.max(ya, yb) >= top && Math.min(ya, yb) <= bottom) return true;
  }
  return false;
}

function coversMarker(label: PlacedLabel, markers: Point[]) {
  return markers.some(
    (marker) =>
      marker.x + MARKER_RADIUS > label.x &&
      marker.x - MARKER_RADIUS < label.x + label.width &&
      Math.abs(marker.y - label.y) < LABEL_HEIGHT / 2 + MARKER_RADIUS
  );
}

/** How far a side label may slide further out when its first spot is taken. */
const SIDE_NUDGE = 16;

/**
 * Positions to try for one label, nearest first: on its preferred side, then beside the point,
 * then on the other side, then each side again one line further out. Each row tries the label
 * centred, then to the right and left of the point, then nudged a little further out.
 * Labels on the last point stay to its left, because the end-of-line value owns the right.
 */
function candidates(request: LabelRequest, width: number, plot: PlotArea): Point[] {
  const fit = (x: number) => clamp(x, plot.left, plot.right - width);
  const right = request.x + SIDE_GAP;
  const left = request.x - SIDE_GAP - width;
  const sideXs = (
    request.isLast
      ? [left, left - SIDE_NUDGE]
      : [right, left, right + SIDE_NUDGE, left - SIDE_NUDGE]
  ).map(fit);
  const xs = request.isLast ? sideXs : [fit(request.x - width / 2), ...sideXs];
  const above = (step: number) => request.y - LABEL_GAP - step * LABEL_HEIGHT;
  const below = (step: number) => request.y + LABEL_GAP + 2 + step * LABEL_HEIGHT;
  // The high reads naturally above its point and a drawdown below its trough.
  const [near, far] = request.kind === 'ath' ? [above, below] : [below, above];

  const rows: Array<[number, number[]]> = [
    [near(0), xs],
    [request.y, sideXs],
    [far(0), xs],
  ];
  for (let step = 1; step < MAX_STEPS; step++) rows.push([near(step), xs], [far(step), xs]);
  return rows.flatMap(([y, rowXs]) => rowXs.map((x) => ({ x, y })));
}

/**
 * Place every milestone label beside its marker. A label never overlaps another label, a
 * marker, the chart line or the plot edge when any nearby position allows it. If none does,
 * it gives up the line first, then the other labels, and always stays inside the plot.
 */
export function layoutMilestoneLabels(
  requests: LabelRequest[],
  plot: PlotArea,
  obstacles: LabelObstacles = { line: [], markers: [] }
): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const traced = traceMonotoneLine(obstacles.line);
  const ordered = [...requests].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);
  for (const request of ordered) {
    const width = labelWidth(request.text);
    const options = candidates(request, width, plot).map(
      ({ x, y }): PlacedLabel => ({ kind: request.kind, text: request.text, x, y, width })
    );
    const fitsPlot = (label: PlacedLabel) =>
      label.y - LABEL_HEIGHT / 2 >= plot.top && label.y + LABEL_HEIGHT / 2 <= plot.bottom;
    const clearOfLabels = (label: PlacedLabel) =>
      fitsPlot(label) &&
      !coversMarker(label, obstacles.markers) &&
      !placed.some((other) => overlaps(other, label));
    const label =
      options.find((option) => clearOfLabels(option) && !crossesLine(option, traced)) ??
      options.find(clearOfLabels) ??
      options.find(fitsPlot) ??
      options[0];
    placed.push(label);
  }
  return placed;
}

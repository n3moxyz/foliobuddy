import type { PortfolioMilestone } from '@/lib/portfolioHistory';

type MilestoneKind = PortfolioMilestone['kind'];

/** Estimated advance of one character of the 11px label, rounded up so boxes never undercount. */
const CHAR_WIDTH = 6.6;
/** One label line, also the step when a label moves to avoid another. */
export const LABEL_HEIGHT = 14;
/** Space between a marker and its nearest label. */
const LABEL_GAP = 13;
/** Space between the last point and labels set to its left. */
const LAST_POINT_GAP = 6;
/** How many lines a label may move on one side of its point before trying the other. */
const MAX_STEPS = 4;
/** Labels claim space in this order, so the high and the deepest drawdown keep their spots. */
const PRIORITY: Record<MilestoneKind, number> = { ath: 0, mdd: 1, daily: 2, live: 3 };

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

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

function overlaps(a: PlacedLabel, b: PlacedLabel) {
  return a.x < b.x + b.width && b.x < a.x + a.width && Math.abs(a.y - b.y) < LABEL_HEIGHT;
}

function candidateYs(request: LabelRequest) {
  const steps = Array.from({ length: MAX_STEPS }, (_, step) => step);
  const above = steps.map((step) => request.y - LABEL_GAP - step * LABEL_HEIGHT);
  const below = steps.map((step) => request.y + LABEL_GAP + 2 + step * LABEL_HEIGHT);
  // The high reads naturally above its point and a drawdown below its trough.
  return request.kind === 'ath' ? [...above, ...below] : [...below, ...above];
}

/**
 * Place every milestone label beside its marker without overlapping another label or leaving
 * the plot. Each label tries its preferred side first, then moves away one line at a time,
 * then tries the other side.
 */
export function layoutMilestoneLabels(requests: LabelRequest[], plot: PlotArea): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const ordered = [...requests].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);
  for (const request of ordered) {
    const width = request.text.length * CHAR_WIDTH;
    const x = request.isLast
      ? clamp(request.x - LAST_POINT_GAP - width, plot.left, plot.right - width)
      : clamp(request.x - width / 2, plot.left, plot.right - width);
    const fitsPlot = (y: number) =>
      y - LABEL_HEIGHT / 2 >= plot.top && y + LABEL_HEIGHT / 2 <= plot.bottom;
    const label = (y: number): PlacedLabel => ({
      kind: request.kind,
      text: request.text,
      x,
      y,
      width,
    });
    const candidates = candidateYs(request);
    const y =
      candidates.find(
        (cy) => fitsPlot(cy) && !placed.some((other) => overlaps(other, label(cy)))
      ) ??
      candidates.find(fitsPlot) ??
      candidates[0];
    placed.push(label(y));
  }
  return placed;
}

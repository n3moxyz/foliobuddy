import { describe, expect, it } from 'vitest';
import {
  LABEL_HEIGHT,
  LINE_CLEARANCE,
  layoutMilestoneLabels,
  traceMonotoneLine,
  type LabelRequest,
  type PlacedLabel,
  type Point,
} from '../milestoneLabelLayout';

const plot = { left: 56, right: 744, top: 24, bottom: 265 };
const request = (overrides: Partial<LabelRequest>): LabelRequest => ({
  kind: 'mdd',
  text: 'MDD -12.50%',
  x: 400,
  y: 150,
  isLast: false,
  ...overrides,
});
const byKind = (labels: ReturnType<typeof layoutMilestoneLabels>, kind: string) =>
  labels.find((label) => label.kind === kind)!;

/** Whether any traced point of the line falls inside the label's box. */
const onLine = (label: PlacedLabel, line: Point[]) =>
  traceMonotoneLine(line).some(
    (point) =>
      point.x >= label.x &&
      point.x <= label.x + label.width &&
      Math.abs(point.y - label.y) <= LABEL_HEIGHT / 2 + LINE_CLEARANCE
  );

describe('layoutMilestoneLabels', () => {
  it('puts the high above its point and drawdowns below theirs', () => {
    const labels = layoutMilestoneLabels(
      [request({ kind: 'ath', text: 'YTD ATH $4.66M', y: 60 }), request({ y: 200 })],
      plot
    );
    expect(byKind(labels, 'ath').y).toBeLessThan(60);
    expect(byKind(labels, 'mdd').y).toBeGreaterThan(200);
  });

  it('moves a label that would overlap another a line away', () => {
    const labels = layoutMilestoneLabels(
      [
        request({ x: 400, y: 150 }),
        request({ kind: 'daily', text: 'MDD (1D) -5.61%', x: 404, y: 148 }),
      ],
      plot
    );
    const mdd = byKind(labels, 'mdd');
    const daily = byKind(labels, 'daily');
    expect(Math.abs(mdd.y - daily.y)).toBeGreaterThanOrEqual(LABEL_HEIGHT);
  });

  it('moves a below-point label up when it would cross the plot bottom', () => {
    const labels = layoutMilestoneLabels([request({ y: 255 })], plot);
    const mdd = byKind(labels, 'mdd');
    expect(mdd.y).toBeLessThanOrEqual(255);
    expect(mdd.y + LABEL_HEIGHT / 2).toBeLessThanOrEqual(plot.bottom);
  });

  it('moves a label off a line that runs through its first choice', () => {
    // The line keeps falling to the right of the marker, through the spot below it.
    const line = [
      { x: 300, y: 110 },
      { x: 350, y: 120 },
      { x: 400, y: 150 },
      { x: 420, y: 190 },
      { x: 460, y: 200 },
    ];
    const labels = layoutMilestoneLabels([request({})], plot, { line, markers: [line[2]] });
    const mdd = byKind(labels, 'mdd');
    expect(onLine(mdd, line)).toBe(false);
    expect(mdd.x + mdd.width).toBeLessThanOrEqual(400);
  });

  it('sets a label beside a point near the plot bottom when the line fills the space above', () => {
    // A slide into a low that sits just above the date axis.
    const line = Array.from({ length: 20 }, (_, index) => ({
      x: 400 + index * 6,
      y: 140 + index * 6,
    }));
    const low = line[line.length - 1];
    const labels = layoutMilestoneLabels([request({ x: low.x, y: low.y, isLast: true })], plot, {
      line,
      markers: [low],
    });
    const mdd = byKind(labels, 'mdd');
    expect(onLine(mdd, line)).toBe(false);
    expect(mdd.y + LABEL_HEIGHT / 2).toBeLessThanOrEqual(plot.bottom);
  });

  it('keeps labels off other markers', () => {
    const live = { x: 410, y: 150 };
    const labels = layoutMilestoneLabels([request({ y: 255 })], plot, {
      line: [],
      markers: [
        { x: 400, y: 255 },
        { ...live, y: 255 },
      ],
    });
    const mdd = byKind(labels, 'mdd');
    const coversLive = mdd.x < live.x + 7 && mdd.x + mdd.width > live.x - 7;
    expect(coversLive && Math.abs(mdd.y - 255) < LABEL_HEIGHT / 2 + 7).toBe(false);
  });

  it('still places a label in the plot when the line blocks every spot', () => {
    // A zigzag across the whole plot leaves no clear position.
    const line = Array.from({ length: 70 }, (_, index) => ({
      x: plot.left + index * 10,
      y: index % 2 === 0 ? plot.top : plot.bottom,
    }));
    const labels = layoutMilestoneLabels([request({}), request({ kind: 'daily' })], plot, {
      line,
      markers: [],
    });
    const [first, second] = labels;
    expect(first.y - LABEL_HEIGHT / 2).toBeGreaterThanOrEqual(plot.top);
    expect(first.y + LABEL_HEIGHT / 2).toBeLessThanOrEqual(plot.bottom);
    const apart =
      first.x + first.width <= second.x ||
      second.x + second.width <= first.x ||
      Math.abs(first.y - second.y) >= LABEL_HEIGHT;
    expect(apart).toBe(true);
  });

  it('keeps labels inside the plot horizontally', () => {
    const labels = layoutMilestoneLabels(
      [
        request({ x: plot.left + 2 }),
        request({ kind: 'ath', text: 'YTD ATH $4.66M', x: plot.right - 2, y: 80 }),
      ],
      plot
    );
    expect(byKind(labels, 'mdd').x).toBeGreaterThanOrEqual(plot.left);
    const ath = byKind(labels, 'ath');
    expect(ath.x + ath.width).toBeLessThanOrEqual(plot.right);
  });

  it('sets labels on the last point to its left', () => {
    const labels = layoutMilestoneLabels([request({ x: plot.right, isLast: true })], plot);
    const mdd = byKind(labels, 'mdd');
    expect(mdd.x + mdd.width).toBeLessThan(plot.right);
  });
});

describe('traceMonotoneLine', () => {
  const line = [
    { x: 0, y: 100 },
    { x: 60, y: 40 },
    { x: 120, y: 90 },
    { x: 180, y: 95 },
  ];

  it('passes through every data point', () => {
    const traced = traceMonotoneLine(line);
    for (const point of line) {
      expect(traced.some((t) => t.x === point.x && Math.abs(t.y - point.y) < 1e-9)).toBe(true);
    }
  });

  it('stays between the two points of each step, as a monotone curve does', () => {
    const traced = traceMonotoneLine(line);
    for (let index = 0; index < line.length - 1; index++) {
      const a = line[index];
      const b = line[index + 1];
      for (const point of traced.filter((t) => t.x >= a.x && t.x <= b.x)) {
        expect(point.y).toBeGreaterThanOrEqual(Math.min(a.y, b.y) - 1e-9);
        expect(point.y).toBeLessThanOrEqual(Math.max(a.y, b.y) + 1e-9);
      }
    }
  });

  it('bows away from the straight line between sparse points', () => {
    const traced = traceMonotoneLine(line);
    const mid = traced.reduce((best, t) =>
      Math.abs(t.x - 150) < Math.abs(best.x - 150) ? t : best
    );
    const straight = 90 + ((95 - 90) * (mid.x - 120)) / 60;
    // The curve leaves its last bend more steeply than the straight line, then flattens out.
    expect(Math.abs(mid.y - straight)).toBeGreaterThan(0.5);
  });
});

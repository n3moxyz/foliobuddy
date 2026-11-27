import { describe, expect, it } from 'vitest';
import { LABEL_HEIGHT, layoutMilestoneLabels, type LabelRequest } from '../milestoneLabelLayout';

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

  it('flips below-point labels above when they would cross the plot bottom', () => {
    const labels = layoutMilestoneLabels([request({ y: 255 })], plot);
    const mdd = byKind(labels, 'mdd');
    expect(mdd.y).toBeLessThan(255);
    expect(mdd.y + LABEL_HEIGHT / 2).toBeLessThanOrEqual(plot.bottom);
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

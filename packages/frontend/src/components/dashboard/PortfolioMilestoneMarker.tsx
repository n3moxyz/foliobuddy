import type { ReactNode } from 'react';
import { PORTFOLIO_MILESTONE_COLORS } from '@/lib/chartColors';
import {
  PORTFOLIO_MILESTONE_EXPLANATIONS,
  PORTFOLIO_MILESTONE_LABELS,
  type PortfolioMilestone,
} from '@/lib/portfolioHistory';
import { formatDrawdown } from '@/lib/utils';
import { PortfolioMilestoneGlyph } from './PortfolioMilestoneGlyph';

/** Space between a marker and its label. */
const LABEL_GAP = 13;
/** Line height when two labels stack below one point. */
const LABEL_LINE = 14;
/** A centred label this close to a plot edge anchors to that edge instead. */
const EDGE_ZONE = 64;
/** Labels below a point, in stacking order. */
const BELOW_KINDS = ['mdd', 'daily'] as const;

type Anchor = 'start' | 'middle' | 'end';

export interface PlotBounds {
  left: number;
  right: number;
}

interface PortfolioMilestoneMarkerProps {
  cx: number;
  cy: number;
  events: PortfolioMilestone[];
  pointDate: string;
  /** The point's value as the chart currently shows it. */
  valueLabel: string;
  isLast: boolean;
  isLive: boolean;
  /** Plot edges in SVG pixels, or null before the chart is measured. */
  plotBounds: PlotBounds | null;
}

function anchorFor(x: number, plotBounds: PlotBounds | null): Anchor {
  if (!plotBounds) return 'middle';
  if (x < plotBounds.left + EDGE_ZONE) return 'start';
  if (x > plotBounds.right - EDGE_ZONE) return 'end';
  return 'middle';
}

function MilestoneLabel({
  x,
  y,
  anchor,
  kind,
  children,
}: {
  x: number;
  y: number;
  anchor: Anchor;
  kind: PortfolioMilestone['kind'];
  children: ReactNode;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      dominantBaseline="middle"
      fontSize={11}
      fontWeight={500}
      fill={PORTFOLIO_MILESTONE_COLORS[kind]}
      // A halo in the card colour keeps the label legible where it crosses the line.
      stroke="hsl(var(--card))"
      strokeWidth={4}
      strokeLinejoin="round"
      paintOrder="stroke"
      data-milestone-label={kind}
    >
      {children}
    </text>
  );
}

/** A chart point's milestone marker, its direct labels, and the end-of-line value label. */
export function PortfolioMilestoneMarker({
  cx,
  cy,
  events,
  pointDate,
  valueLabel,
  isLast,
  isLive,
  plotBounds,
}: PortfolioMilestoneMarkerProps) {
  const marker = events.find((event) => event.kind === 'mdd') ?? events[0];
  const ath = events.find((event) => event.kind === 'ath');
  const below = BELOW_KINDS.flatMap((kind) => events.filter((event) => event.kind === kind));
  // The end label owns the right of the last point, so its other labels sit to the left.
  const anchor = isLast ? 'end' : anchorFor(cx, plotBounds);
  const labelX = isLast ? cx - 6 : cx;

  return (
    <g>
      <g
        transform={`translate(${cx}, ${cy})`}
        className="cursor-help"
        data-portfolio-milestone={events.map((event) => event.kind).join(' ')}
      >
        <title>
          {events
            .map(
              (event) =>
                `${PORTFOLIO_MILESTONE_LABELS[event.kind]}: ${PORTFOLIO_MILESTONE_EXPLANATIONS[event.kind]}`
            )
            .join(' ')}{' '}
          — {pointDate}
        </title>
        <PortfolioMilestoneGlyph kind={marker?.kind ?? 'live'} />
      </g>
      {ath && (
        <MilestoneLabel x={labelX} y={cy - LABEL_GAP} anchor={anchor} kind="ath">
          {/* The end label already shows the value of a high set today. */}
          {isLast
            ? PORTFOLIO_MILESTONE_LABELS.ath
            : `${PORTFOLIO_MILESTONE_LABELS.ath} ${valueLabel}`}
        </MilestoneLabel>
      )}
      {below.map((event, index) => (
        <MilestoneLabel
          key={event.kind}
          x={labelX}
          y={cy + LABEL_GAP + 2 + index * LABEL_LINE}
          anchor={anchor}
          kind={event.kind}
        >
          {`${PORTFOLIO_MILESTONE_LABELS[event.kind]} ${formatDrawdown(event.drawdownPct)}`}
        </MilestoneLabel>
      ))}
      {isLast && (
        <>
          <text
            x={cx + 8}
            y={cy - 2}
            fontSize={11}
            dominantBaseline="middle"
            fontWeight={600}
            fill="currentColor"
            className="text-foreground"
            data-chart-end-label="true"
          >
            {valueLabel}
          </text>
          {isLive && (
            <text
              x={cx + 8}
              y={cy + 12}
              fontSize={10}
              dominantBaseline="middle"
              fill={PORTFOLIO_MILESTONE_COLORS.live}
            >
              Live
            </text>
          )}
        </>
      )}
    </g>
  );
}

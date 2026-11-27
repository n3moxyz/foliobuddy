import { PORTFOLIO_MILESTONE_COLORS } from '@/lib/chartColors';
import {
  PORTFOLIO_MILESTONE_EXPLANATIONS,
  PORTFOLIO_MILESTONE_LABELS,
  type PortfolioMilestone,
} from '@/lib/portfolioHistory';
import { PortfolioMilestoneGlyph } from './PortfolioMilestoneGlyph';

interface PortfolioMilestoneMarkerProps {
  cx: number;
  cy: number;
  events: PortfolioMilestone[];
  pointDate: string;
  /** The point's value as the chart currently shows it. */
  valueLabel: string;
  isLast: boolean;
  isLive: boolean;
}

/**
 * A chart point's milestone marker and, on the last point, the end-of-line value.
 * `PortfolioMilestoneLabels` places the milestone names, because that needs every label at once.
 */
export function PortfolioMilestoneMarker({
  cx,
  cy,
  events,
  pointDate,
  valueLabel,
  isLast,
  isLive,
}: PortfolioMilestoneMarkerProps) {
  const marker = events.find((event) => event.kind === 'mdd') ?? events[0];
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

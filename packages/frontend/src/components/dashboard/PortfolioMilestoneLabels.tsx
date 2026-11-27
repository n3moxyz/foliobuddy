import { PORTFOLIO_MILESTONE_COLORS } from '@/lib/chartColors';
import { PORTFOLIO_MILESTONE_LABELS, type PortfolioMilestone } from '@/lib/portfolioHistory';
import { formatDrawdown } from '@/lib/utils';
import { layoutMilestoneLabels, type LabelRequest } from './milestoneLabelLayout';

/** Kinds named on the plot. Live is named by the end-of-line label instead. */
const LABELLED_KINDS = new Set<PortfolioMilestone['kind']>(['ath', 'mdd', 'daily']);

interface ChartPoint {
  milestones: PortfolioMilestone[];
}

/**
 * The slice of chart state Recharts passes to a `<Customized>` child.
 * The library types these props as `any`.
 */
interface CustomizedChartState {
  formattedGraphicalItems?: Array<{ props?: { points?: Array<{ x: number; y: number }> } }>;
  offset?: { top: number; left: number; width: number; height: number };
}

interface PortfolioMilestoneLabelsProps extends CustomizedChartState {
  data: ChartPoint[];
  /** The value text for a point, as the chart currently shows it. */
  valueLabelAt: (index: number) => string;
}

function labelText(event: PortfolioMilestone, isLast: boolean, valueLabel: string) {
  const name = PORTFOLIO_MILESTONE_LABELS[event.kind];
  // The end label already shows the value of a high set on the last point.
  if (event.kind === 'ath') return isLast ? name : `${name} ${valueLabel}`;
  return `${name} ${formatDrawdown(event.drawdownPct)}`;
}

/** Names each milestone beside its marker, laid out together so no two labels collide. */
export function PortfolioMilestoneLabels({
  data,
  valueLabelAt,
  formattedGraphicalItems,
  offset,
}: PortfolioMilestoneLabelsProps) {
  const points = formattedGraphicalItems?.[0]?.props?.points;
  if (!points || !offset) return null;

  const lastIndex = data.length - 1;
  const requests: LabelRequest[] = data.flatMap((point, index) => {
    const position = points[index];
    if (!position || !Number.isFinite(position.y)) return [];
    const isLast = index === lastIndex;
    return point.milestones
      .filter((event) => LABELLED_KINDS.has(event.kind))
      .map((event) => ({
        kind: event.kind,
        text: labelText(event, isLast, valueLabelAt(index)),
        x: position.x,
        y: position.y,
        isLast,
      }));
  });
  const labels = layoutMilestoneLabels(requests, {
    left: offset.left,
    right: offset.left + offset.width,
    top: offset.top,
    bottom: offset.top + offset.height,
  });

  return (
    <g>
      {labels.map((label) => (
        <text
          key={label.kind}
          x={label.x}
          y={label.y}
          textAnchor="start"
          dominantBaseline="middle"
          fontSize={11}
          fontWeight={500}
          fill={PORTFOLIO_MILESTONE_COLORS[label.kind]}
          // A halo in the card colour keeps the label legible where it crosses the line.
          stroke="hsl(var(--card))"
          strokeWidth={4}
          strokeLinejoin="round"
          paintOrder="stroke"
          data-milestone-label={label.kind}
        >
          {label.text}
        </text>
      ))}
    </g>
  );
}

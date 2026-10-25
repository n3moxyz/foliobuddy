import {
  CHART_SURFACE_COLOR,
  DRAWDOWN_MARKER_COLOR,
  PORTFOLIO_LINE_COLOR,
} from '@/lib/chartColors';
import type { PortfolioMilestone } from '@/lib/portfolioHistory';

export function PortfolioMilestoneGlyph({
  kind,
  highlighted = false,
}: {
  kind: PortfolioMilestone['kind'];
  highlighted?: boolean;
}) {
  const color = kind === 'mdd' || kind === 'daily' ? DRAWDOWN_MARKER_COLOR : PORTFOLIO_LINE_COLOR;
  const style = { stroke: color, strokeWidth: 1.5, fill: CHART_SURFACE_COLOR };
  const shape =
    kind === 'ath' ? (
      <path d="M0 -4.5 4.5 0 0 4.5 -4.5 0Z" {...style} />
    ) : kind === 'mdd' ? (
      <path d="M-4.5 -3 4.5 -3 0 4.5Z" {...style} />
    ) : kind === 'daily' ? (
      <rect x={-3.5} y={-3.5} width={7} height={7} rx={1} {...style} />
    ) : (
      <circle r={3.5} {...style} fill={color} />
    );
  return (
    <>
      {highlighted && (
        <circle
          data-milestone-highlight="true"
          r={10}
          fill={color}
          fillOpacity={0.12}
          stroke={color}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      )}
      <g transform={highlighted ? 'scale(1.4)' : undefined}>{shape}</g>
    </>
  );
}

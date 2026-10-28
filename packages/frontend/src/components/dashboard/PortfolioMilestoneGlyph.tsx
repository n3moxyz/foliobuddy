import { PORTFOLIO_MILESTONE_COLORS } from '@/lib/chartColors';
import type { PortfolioMilestone } from '@/lib/portfolioHistory';

export function PortfolioMilestoneGlyph({
  kind,
  highlighted = false,
}: {
  kind: PortfolioMilestone['kind'];
  highlighted?: boolean;
}) {
  const color = PORTFOLIO_MILESTONE_COLORS[kind];
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
      <g transform={highlighted ? 'scale(1.4)' : undefined}>
        <circle r={3.5} stroke={color} strokeWidth={1.5} fill={color} />
      </g>
    </>
  );
}

import { PORTFOLIO_MILESTONE_COLORS } from '@/lib/chartColors';
import type { PortfolioMilestone } from '@/lib/portfolioHistory';

export function PortfolioMilestoneGlyph({ kind }: { kind: PortfolioMilestone['kind'] }) {
  // The card-coloured ring separates the marker from the line it sits on.
  return (
    <circle
      r={4}
      fill={PORTFOLIO_MILESTONE_COLORS[kind]}
      stroke="hsl(var(--card))"
      strokeWidth={2}
    />
  );
}

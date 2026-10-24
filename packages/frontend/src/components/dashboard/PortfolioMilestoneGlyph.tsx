import {
  CHART_SURFACE_COLOR,
  DRAWDOWN_MARKER_COLOR,
  PORTFOLIO_LINE_COLOR,
} from '@/lib/chartColors';
import type { PortfolioMilestone } from '@/lib/portfolioHistory';

export function PortfolioMilestoneGlyph({ kind }: { kind: PortfolioMilestone['kind'] }) {
  const color = kind === 'mdd' || kind === 'daily' ? DRAWDOWN_MARKER_COLOR : PORTFOLIO_LINE_COLOR;
  const style = { stroke: color, strokeWidth: 1.5, fill: CHART_SURFACE_COLOR };
  if (kind === 'ath') return <path d="M0 -4.5 4.5 0 0 4.5 -4.5 0Z" {...style} />;
  if (kind === 'mdd') return <path d="M-4.5 -3 4.5 -3 0 4.5Z" {...style} />;
  if (kind === 'daily') return <rect x={-3.5} y={-3.5} width={7} height={7} rx={1} {...style} />;
  return <circle r={3.5} {...style} fill={kind === 'live' ? color : CHART_SURFACE_COLOR} />;
}

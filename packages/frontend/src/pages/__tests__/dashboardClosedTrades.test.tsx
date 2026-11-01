import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import type { PortfolioSummary } from '@/lib/types';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';
import Dashboard from '../Dashboard';

// The hero's value animation reads matchMedia, which jsdom doesn't implement.
vi.mock('@/hooks/useAnimatedNumber', () => ({
  useAnimatedNumbers: (targets: Array<number | null | undefined>) =>
    targets.map((target) => target ?? 0),
}));

afterEach(() => vi.restoreAllMocks());

const summary: PortfolioSummary = {
  totalValueUsd: 3_936_941,
  totalValueSgd: 5_040_643,
  totalCostBasis: 4_064_552,
  unrealizedPnL: -127_611,
  unrealizedPnLPct: -3.14,
  positionCount: 26,
  lastUpdated: '2026-08-12T00:00:00.000Z',
  ytdStartDate: '2026-01-01T00:00:00.000Z',
};

describe('Dashboard closed-trades tile', () => {
  it.each([
    ['still loading', () => new Promise<never>(() => {})],
    ['failed to load', () => Promise.reject(new Error('Network unavailable'))],
  ])('shows "-", never 0, while the count has %s', async (_state, loadAnalytics) => {
    // Isolate every other request; only the summary loads.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    vi.spyOn(api, 'getPositionSummary').mockResolvedValue(summary);
    vi.spyOn(api, 'getTradeAnalytics').mockImplementation(loadAnalytics);
    const client = createTestQueryClient();
    const Wrapper = createQueryClientWrapper(client);
    render(
      <Wrapper>
        <TooltipProvider>
          <MemoryRouter>
            <Dashboard />
          </MemoryRouter>
        </TooltipProvider>
      </Wrapper>
    );

    const rail = await screen.findByRole('region', { name: 'Net worth statistics' });
    expect(
      within(rail).getByRole('link', { name: 'Closed trades not loaded — view trade journal' })
    ).toBeInTheDocument();
    client.clear();
  });
});

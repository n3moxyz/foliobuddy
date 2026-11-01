import { act, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { focusManager, type QueryClient } from '@tanstack/react-query';
import { USER_PREFERENCES_QUERY_KEY } from '@/hooks/useUserPreferences';
import { api } from '@/lib/api';
import type { PortfolioSummary, Position, UserPreferences } from '@/lib/types';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';
import Dashboard from '../Dashboard';

// The hero's value animation reads matchMedia, which jsdom doesn't implement.
vi.mock('@/hooks/useAnimatedNumber', () => ({
  useAnimatedNumbers: (targets: Array<number | null | undefined>) =>
    targets.map((target) => target ?? 0),
}));

const summary: PortfolioSummary = {
  totalValueUsd: 80_000,
  totalValueSgd: 102_400,
  totalCostBasis: 70_000,
  unrealizedPnL: 10_000,
  unrealizedPnLPct: 14.29,
  positionCount: 2,
  lastUpdated: '2026-08-12T00:00:00.000Z',
  ytdStartDate: '2026-01-01T00:00:00.000Z',
};

const positions = [
  {
    id: 'btc-position',
    assetId: 'btc',
    asset: { id: 'btc', category: 'LIQUID_CRYPTO', symbol: 'BTC', name: 'Bitcoin' },
    storageType: 'CEX',
    storageLocation: 'Binance',
    custodyOf: null,
    quantity: 1,
    avgCostUsd: 30_000,
    marketValueUsd: 40_000,
    unrealizedPnL: 10_000,
    unrealizedPnLPct: 33.33,
  },
  {
    id: 'cash-position',
    assetId: 'cash-usd',
    asset: { id: 'cash-usd', category: 'CASH', symbol: 'USD', name: 'Cash USD' },
    storageType: 'BANK',
    storageLocation: 'DBS',
    custodyOf: null,
    quantity: 40_000,
    avgCostUsd: 1,
    marketValueUsd: 40_000,
    unrealizedPnL: 0,
    unrealizedPnLPct: 0,
  },
] as Position[];

const preferences: UserPreferences = {
  snapshotHour: 5,
  snapshotTimezone: 'Asia/Singapore',
  perpExposureUsd: 0,
};

const pending = () => new Promise<never>(() => {});
const failed = () => Promise.reject(new Error('Network unavailable'));

// React Query tells components about a change on the next tick; let that render land.
const flushQueryUpdates = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

let client: QueryClient;

// Once positions load, the charts measure with ResizeObserver, which jsdom doesn't implement.
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  // Isolate every request; each test loads only what it names.
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
  vi.spyOn(api, 'getPositionSummary').mockResolvedValue(summary);
});

afterEach(() => {
  focusManager.setFocused(undefined);
  client?.clear();
  vi.restoreAllMocks();
});

async function renderRail() {
  client = createTestQueryClient();
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
  return screen.findByRole('region', { name: 'Net worth statistics' });
}

describe('Dashboard tiles that have not loaded', () => {
  it.each([
    ['still loading', pending],
    ['failed to load', failed],
  ])('shows "-", never 0, while the closed-trade count has %s', async (_state, loadAnalytics) => {
    vi.spyOn(api, 'getTradeAnalytics').mockImplementation(loadAnalytics);

    const rail = await renderRail();
    expect(
      within(rail).getByRole('link', { name: 'Closed trades not loaded — view trade journal' })
    ).toBeInTheDocument();
  });

  it.each([
    ['positions are still loading', pending, () => Promise.resolve(preferences)],
    ['positions failed to load', failed, () => Promise.resolve(preferences)],
    ['the perp setting is still loading', () => Promise.resolve(positions), pending],
    ['the perp setting failed to load', () => Promise.resolve(positions), failed],
  ])('shows "-", never 0.0%, for Exposure while %s', async (_state, loadPositions, loadPrefs) => {
    vi.spyOn(api, 'getPositions').mockImplementation(loadPositions);
    vi.spyOn(api, 'getUserPreferences').mockImplementation(loadPrefs);

    const rail = await renderRail();
    expect(
      within(rail).getByRole('link', { name: 'Exposure unavailable — view portfolio' })
    ).toBeInTheDocument();
  });

  it('works Exposure out once positions and the perp setting have loaded', async () => {
    vi.spyOn(api, 'getPositions').mockResolvedValue(positions);
    vi.spyOn(api, 'getUserPreferences').mockResolvedValue({
      ...preferences,
      perpExposureUsd: 8_000,
    });

    const rail = await renderRail();
    // (BTC 40,000 + perps 8,000) ÷ 80,000; cash is not market risk.
    await waitFor(() =>
      expect(within(rail).getAllByRole('link')[0].textContent).toBe('60.0% — view portfolio')
    );
  });

  it('keeps a worked-out Exposure when a later refresh of the perp setting fails', async () => {
    vi.spyOn(api, 'getPositions').mockResolvedValue(positions);
    vi.spyOn(api, 'getUserPreferences')
      .mockResolvedValueOnce({ ...preferences, perpExposureUsd: 8_000 })
      .mockRejectedValueOnce(new Error('Network unavailable'));

    const rail = await renderRail();
    const exposureLink = () => within(rail).getAllByRole('link')[0];
    await waitFor(() => expect(exposureLink().textContent).toBe('60.0% — view portfolio'));

    // Returning to the tab refreshes the perp setting; this time the request fails.
    act(() => {
      focusManager.setFocused(false);
    });
    act(() => {
      focusManager.setFocused(true);
    });
    await waitFor(() =>
      expect(client.getQueryState(USER_PREFERENCES_QUERY_KEY)?.status).toBe('error')
    );
    await flushQueryUpdates();
    expect(exposureLink().textContent).toBe('60.0% — view portfolio');
  });

  it('shows "-", never 0.0%, for Exposure when perps are set but nothing is owned', async () => {
    vi.spyOn(api, 'getPositionSummary').mockResolvedValue({
      ...summary,
      totalValueUsd: 0,
      totalValueSgd: 0,
      totalCostBasis: 0,
      unrealizedPnL: 0,
      unrealizedPnLPct: 0,
      positionCount: 0,
    });
    vi.spyOn(api, 'getPositions').mockResolvedValue([]);
    vi.spyOn(api, 'getUserPreferences').mockResolvedValue({
      ...preferences,
      perpExposureUsd: 8_000,
    });

    const rail = await renderRail();
    // Everything has loaded, so this "-" is not a loading state: there is no total to divide by.
    await waitFor(() => {
      expect(client.getQueryState(['positions'])?.status).toBe('success');
      expect(client.getQueryState(USER_PREFERENCES_QUERY_KEY)?.status).toBe('success');
    });
    await flushQueryUpdates();
    expect(
      within(rail).getByRole('link', { name: 'Exposure unavailable — view portfolio' })
    ).toBeInTheDocument();
  });
});

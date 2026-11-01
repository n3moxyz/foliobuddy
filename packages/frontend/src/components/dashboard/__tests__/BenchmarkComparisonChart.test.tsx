import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import type { ProviderSearchResult } from '@/lib/types';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';
import { BenchmarkComparisonChart } from '../BenchmarkComparisonChart';

vi.mock('@/hooks/usePortfolio', () => ({
  usePerformanceHistory: () => ({ data: [], isLoading: false, isFetching: false }),
}));
vi.mock('../ChartCopyButton', () => ({ ChartCopyButton: () => null }));

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
afterAll(() => vi.unstubAllGlobals());

// The box runs one search per provider; each test sets what each one answers.
const searchByProvider = {
  coingecko: vi.fn<() => Promise<ProviderSearchResult[]>>(),
  yahoo: vi.fn<() => Promise<ProviderSearchResult[]>>(),
};

const paxGold: ProviderSearchResult = {
  id: 'pax-gold',
  providerAssetId: 'pax-gold',
  provider: 'coingecko',
  symbol: 'paxg',
  name: 'PAX Gold',
  exchange: null,
  nativeCurrency: null,
  rank: 120,
};

const offline = () => new TypeError('Failed to fetch');

function openBenchmarkSearch() {
  const Wrapper = createQueryClientWrapper(createTestQueryClient());
  render(
    <Wrapper>
      <BenchmarkComparisonChart />
    </Wrapper>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  return screen.getByRole('textbox', { name: 'Search for a benchmark' });
}

beforeEach(() => {
  searchByProvider.coingecko.mockReset().mockResolvedValue([]);
  searchByProvider.yahoo.mockReset().mockResolvedValue([]);
  vi.spyOn(api, 'getBenchmarkHistory').mockResolvedValue({ days: 365, data: [] });
  vi.spyOn(api, 'searchAssets').mockImplementation((_query, params) =>
    params?.provider === 'yahoo' ? searchByProvider.yahoo() : searchByProvider.coingecko()
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Dashboard benchmark search: search states', () => {
  it('shows Searching…, not "No matching benchmarks", while the debounce waits', async () => {
    const input = openBenchmarkSearch();

    fireEvent.change(input, { target: { value: 'zzz' } });

    // No request has started, so there is no answer to report yet.
    expect(api.searchAssets).not.toHaveBeenCalled();
    expect(screen.getByText('Searching…')).toBeInTheDocument();
    expect(screen.queryByText('No matching benchmarks')).not.toBeInTheDocument();

    // Both searches answered with nothing: a real "no match".
    expect(await screen.findByText('No matching benchmarks')).toBeInTheDocument();
    expect(api.searchAssets).toHaveBeenCalledWith('zzz', { provider: 'coingecko' });
    expect(api.searchAssets).toHaveBeenCalledWith('zzz', { provider: 'yahoo' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the error, not "No matching benchmarks", and retries only the failed search', async () => {
    searchByProvider.yahoo.mockRejectedValueOnce(offline());
    const input = openBenchmarkSearch();

    fireEvent.change(input, { target: { value: 'zzz' } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't search benchmarks");
    expect(alert).toHaveTextContent('Check your connection and try again.');
    expect(screen.queryByText('No matching benchmarks')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('No matching benchmarks')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(searchByProvider.yahoo).toHaveBeenCalledTimes(2);
    expect(searchByProvider.coingecko).toHaveBeenCalledTimes(1);
    expect(input).toHaveFocus();
  });

  it('keeps the results that did arrive beside the error', async () => {
    searchByProvider.yahoo.mockRejectedValue(offline());
    searchByProvider.coingecko.mockResolvedValue([paxGold]);
    const input = openBenchmarkSearch();

    fireEvent.change(input, { target: { value: 'gold' } });

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't search benchmarks");
    expect(screen.getByRole('button', { name: /PAXG/ })).toBeInTheDocument();
    expect(screen.queryByText('No matching benchmarks')).not.toBeInTheDocument();
  });

  it('treats whitespace alone as no query: no search and no empty line', async () => {
    const input = openBenchmarkSearch();

    fireEvent.change(input, { target: { value: '   ' } });

    expect(screen.queryByText('Searching…')).not.toBeInTheDocument();
    expect(screen.queryByText('No matching benchmarks')).not.toBeInTheDocument();
    // Outlast the 200 ms debounce: whitespace never reaches the API.
    await act(() => new Promise((resolve) => setTimeout(resolve, 250)));
    expect(api.searchAssets).not.toHaveBeenCalled();
    expect(screen.queryByText('No matching benchmarks')).not.toBeInTheDocument();
  });
});

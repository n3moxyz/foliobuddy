import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import News from '../News';
import type { NewsItem, PortfolioNewsResponse } from '@/lib/types';

const mocks = vi.hoisted(() => ({ useNews: vi.fn() }));

vi.mock('@/hooks/useNews', () => ({ useNews: mocks.useNews }));

function fixtureItem(overrides: Partial<NewsItem> & Pick<NewsItem, 'id' | 'title'>): NewsItem {
  return {
    publisher: 'Wire',
    url: `https://example.com/${overrides.id}`,
    publishedAt: '2026-08-24T10:00:00.000Z',
    sourceTier: 4,
    sourceLabel: null,
    primarySource: false,
    importance: 'low',
    eventType: 'general',
    affectedSymbols: [],
    rankingReasons: [],
    ...overrides,
  };
}

function fixtureResponse(overrides: Partial<PortfolioNewsResponse> = {}): PortfolioNewsResponse {
  return {
    topStories: [],
    crypto: [],
    equities: [],
    macro: [],
    fetchedAt: '2026-08-24T11:00:00.000Z',
    ...overrides,
  };
}

const loadedNews = fixtureResponse({
  crypto: [
    {
      assetId: 'asset-btc',
      symbol: 'BTC',
      name: 'Bitcoin',
      category: 'LIQUID_CRYPTO',
      openTradeOnly: false,
      items: [fixtureItem({ id: 'story-1', title: 'Bitcoin story', affectedSymbols: ['BTC'] })],
    },
  ],
});

function newsQueryState(overrides: Record<string, unknown>) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
    ...overrides,
  };
}

function renderNews() {
  return render(
    <MemoryRouter>
      <News />
    </MemoryRouter>
  );
}

describe('News page', () => {
  it('keeps loaded headlines visible when a refetch fails', () => {
    mocks.useNews.mockReturnValue(
      newsQueryState({ data: loadedNews, isError: true, error: new Error('yahoo down') })
    );

    renderNews();

    expect(screen.getByText('Bitcoin story')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't refresh — showing the last loaded headlines."
    );
    expect(screen.queryByText("Couldn't load news")).not.toBeInTheDocument();
  });

  it('shows the full-page error only when nothing has ever loaded', () => {
    mocks.useNews.mockReturnValue(
      newsQueryState({ isError: true, error: new Error('yahoo down') })
    );

    renderNews();

    expect(screen.getByText("Couldn't load news")).toBeInTheDocument();
    expect(screen.getByText('yahoo down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('offers a Portfolio CTA when the feed is empty', () => {
    mocks.useNews.mockReturnValue(newsQueryState({ data: fixtureResponse() }));

    renderNews();

    expect(screen.getByText('No news yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Portfolio' })).toHaveAttribute(
      'href',
      '/portfolio'
    );
  });

  it('omits the Top stories section on quiet days', () => {
    mocks.useNews.mockReturnValue(newsQueryState({ data: loadedNews }));

    renderNews();

    expect(screen.queryByText('Top stories')).not.toBeInTheDocument();
    expect(screen.queryByText('Important')).not.toBeInTheDocument();
  });

  it('renders Top stories and restrained badges for material news', () => {
    const material = fixtureItem({
      id: 'material',
      title: 'SEC approves spot Bitcoin ETF options',
      publisher: 'Reuters',
      sourceTier: 2,
      sourceLabel: 'Trusted press',
      importance: 'high',
      eventType: 'regulation',
      affectedSymbols: ['BTC', 'ETH'],
      rankingReasons: ['Regulation', 'Trusted press', 'Held position'],
    });
    const primary = fixtureItem({
      id: 'primary',
      title: 'Fed statement on rate decision',
      publisher: 'Federal Reserve',
      sourceTier: 1,
      sourceLabel: 'Primary source',
      primarySource: true,
      importance: 'high',
      eventType: 'macro',
    });
    mocks.useNews.mockReturnValue(
      newsQueryState({
        data: fixtureResponse({
          topStories: [material],
          crypto: [
            {
              assetId: 'asset-btc',
              symbol: 'BTC',
              name: 'Bitcoin',
              category: 'LIQUID_CRYPTO',
              openTradeOnly: false,
              items: [material],
            },
          ],
          macro: [primary],
        }),
      })
    );

    renderNews();

    expect(screen.getByText('Top stories')).toBeInTheDocument();
    // Once in Top stories, once in the BTC group.
    expect(screen.getAllByText('SEC approves spot Bitcoin ETF options')).toHaveLength(2);
    expect(screen.getAllByText('Important').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Primary source')).toBeInTheDocument();
    // Event label in the meta line; the group row points at the co-affected holding.
    expect(screen.getByText(/Reuters .* Regulation .* also affects ETH/)).toBeInTheDocument();
  });
});

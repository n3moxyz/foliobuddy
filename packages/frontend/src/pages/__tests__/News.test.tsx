import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import News from '../News';
import type { NewsItem, PortfolioNewsResponse } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  useNews: vi.fn(),
  useNewsEnrichment: vi.fn(),
  sendNewsFeedback: vi.fn(),
}));

vi.mock('@/hooks/useNews', () => ({
  useNews: mocks.useNews,
  useNewsEnrichment: mocks.useNewsEnrichment,
}));
vi.mock('@/lib/api', () => ({
  api: { sendNewsFeedback: mocks.sendNewsFeedback },
}));

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
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <News />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('News page', () => {
  beforeEach(() => {
    mocks.useNewsEnrichment.mockReturnValue({ data: undefined });
  });

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

  it('offers a feedback flag outside the link and marks featured section rows', async () => {
    const material = fixtureItem({
      id: 'material',
      title: 'SEC approves spot Bitcoin ETF options',
      importance: 'high',
      eventType: 'regulation',
      affectedSymbols: ['BTC'],
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
        }),
      })
    );

    renderNews();

    // One flag control per rendered row, each its own tab stop outside the link.
    const flags = screen.getAllByRole('button', {
      name: /Flag story: SEC approves spot Bitcoin ETF options/,
    });
    expect(flags).toHaveLength(2);
    // The section copy is marked as already featured; the Top stories copy is not.
    expect(screen.getByText(/in Top stories/)).toBeInTheDocument();

    // Drive the full flow on the BTC group row: open (Radix opens on
    // pointerdown), pick a reason, and assert the exact payload sent.
    fireEvent.pointerDown(flags[1]);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Not relevant' }));

    // TanStack v5 passes a context object as mutationFn's 2nd arg — assert
    // the payload (1st arg) only.
    await waitFor(() => expect(mocks.sendNewsFeedback).toHaveBeenCalled());
    expect(mocks.sendNewsFeedback.mock.calls[0][0]).toEqual({
      storyId: 'material',
      title: 'SEC approves spot Bitcoin ETF options',
      publisher: 'Wire',
      eventType: 'regulation',
      importance: 'high',
      symbol: 'BTC',
      reason: 'not_relevant',
    });
  });

  it('renders AI enrichment on top stories and degrades gracefully without it', () => {
    const material = fixtureItem({
      id: 'material',
      title: 'SEC approves spot Bitcoin ETF options',
      importance: 'high',
      eventType: 'regulation',
      affectedSymbols: ['BTC'],
    });
    const unenriched = fixtureItem({
      id: 'unenriched',
      title: 'Exchange discloses security incident',
      importance: 'high',
      eventType: 'security',
      affectedSymbols: ['ETH'],
    });
    mocks.useNews.mockReturnValue(
      newsQueryState({
        // Mirror real backend shape: top stories also appear in their sections.
        data: fixtureResponse({
          topStories: [material, unenriched],
          macro: [material, unenriched],
        }),
      })
    );
    mocks.useNewsEnrichment.mockReturnValue({
      data: {
        enabled: true,
        enrichments: {
          material: {
            id: 'material',
            summary: 'The SEC approved options trading on spot Bitcoin ETFs.',
            whyItMatters: 'Options deepen liquidity for the ETFs BTC holders track.',
            provenance: 'article',
            confidence: 'high',
            enrichedAt: '2026-08-25T06:00:00.000Z',
          },
        },
      },
    });

    renderNews();

    expect(
      screen.getByText('The SEC approved options trading on spot Bitcoin ETFs.')
    ).toBeInTheDocument();
    expect(screen.getByText(/Why it matters — Options deepen liquidity/)).toBeInTheDocument();
    expect(screen.getByText(/AI summary from the article · high confidence/)).toBeInTheDocument();
    // The un-enriched story still renders (in Top stories and its section)
    // with no summary block — enrichment only ever decorates Top stories rows.
    expect(screen.getAllByText('Exchange discloses security incident')).toHaveLength(2);
    expect(screen.getAllByText(/AI summary from the article/)).toHaveLength(1);
  });
});

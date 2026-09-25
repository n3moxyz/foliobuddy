import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import News from '../News';
import type {
  AssetNewsGroup,
  AssetNewsResponse,
  NewsHolding,
  NewsItem,
  PortfolioNewsResponse,
} from '@/lib/types';

const mocks = vi.hoisted(() => ({
  useNews: vi.fn(),
  useNewsEnrichment: vi.fn(),
  useAssetNews: vi.fn(),
  sendNewsFeedback: vi.fn(),
}));

vi.mock('@/hooks/useNews', () => ({
  useNews: mocks.useNews,
  useNewsEnrichment: mocks.useNewsEnrichment,
  useAssetNews: mocks.useAssetNews,
}));
vi.mock('@/lib/api', () => ({
  api: { sendNewsFeedback: mocks.sendNewsFeedback },
}));

// jsdom has no layout; the page scrolls the window when switching views.
const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

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

function fixtureGroup(
  overrides: Partial<AssetNewsGroup> & Pick<AssetNewsGroup, 'assetId' | 'symbol' | 'name'>
): AssetNewsGroup {
  return { category: 'LIQUID_CRYPTO', openTradeOnly: false, items: [], ...overrides };
}

function fixtureHolding(
  overrides: Partial<NewsHolding> & Pick<NewsHolding, 'assetId' | 'symbol' | 'name'>
): NewsHolding {
  return {
    category: 'LIQUID_CRYPTO',
    bucket: 'crypto',
    openTradeOnly: false,
    storyCount: 0,
    loaded: true,
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

const btcStories = [
  fixtureItem({ id: 'btc-1', title: 'Bitcoin ETF inflows hit a three-week high' }),
  fixtureItem({ id: 'btc-2', title: 'Miner reserves fall to multi-year lows' }),
  fixtureItem({
    id: 'btc-3',
    title: 'Custody demand pushes cold storage premiums higher',
    affectedSymbols: ['BTC', 'ETH'],
  }),
];

const btcHolding = fixtureHolding({
  assetId: 'asset-btc',
  symbol: 'BTC',
  name: 'Bitcoin',
  storyCount: 4,
});

// Feed with holdings: one card per bucket, a quiet holding and one past the fetch cap.
const holdingsNews = fixtureResponse({
  topStories: [btcStories[0]],
  crypto: [
    fixtureGroup({
      assetId: 'asset-btc',
      symbol: 'BTC',
      name: 'Bitcoin',
      items: btcStories,
      storyCount: 4,
    }),
  ],
  equities: [
    fixtureGroup({
      assetId: 'asset-voo',
      symbol: 'VOO',
      name: 'Vanguard S&P 500 ETF',
      category: 'EQUITY',
      items: [fixtureItem({ id: 'voo-1', title: 'Index funds see steady inflows' })],
      storyCount: 1,
    }),
  ],
  holdings: [
    btcHolding,
    fixtureHolding({
      assetId: 'asset-voo',
      symbol: 'VOO',
      name: 'Vanguard S&P 500 ETF',
      category: 'EQUITY',
      bucket: 'equities',
      storyCount: 1,
    }),
    fixtureHolding({ assetId: 'asset-hype', symbol: 'HYPE', name: 'Hyperliquid' }),
    fixtureHolding({
      assetId: 'asset-aapl',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      category: 'EQUITY',
      bucket: 'equities',
      loaded: false,
    }),
  ],
});

const btcDossier: AssetNewsResponse = {
  holding: {
    assetId: 'asset-btc',
    symbol: 'BTC',
    name: 'Bitcoin',
    category: 'LIQUID_CRYPTO',
    bucket: 'crypto',
    openTradeOnly: false,
  },
  items: [
    ...btcStories,
    fixtureItem({ id: 'btc-4', title: 'Hashrate sets a record as new rigs come online' }),
  ],
  windowDays: 60,
  fetchedAt: '2026-08-24T11:00:00.000Z',
};

function newsQueryState(overrides: Record<string, unknown>) {
  return {
    data: undefined,
    // React Query: pending = nothing loaded and no error yet (fetching or paused).
    isPending: overrides.data === undefined && overrides.isError !== true,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
    ...overrides,
  };
}

/** Exposes the router location and a browser-Back stand-in to the tests. */
function RouterProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location-search">{location.search}</output>
      <button type="button" onClick={() => navigate(-1)}>
        Browser back
      </button>
    </>
  );
}

function renderNews(initialEntry = '/news') {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <News />
        <RouterProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function locationSearch() {
  return screen.getByTestId('location-search').textContent;
}

describe('News page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useNewsEnrichment.mockReturnValue({ data: undefined });
    mocks.useAssetNews.mockReturnValue(newsQueryState({}));
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

  it.each([
    ['loading', { isLoading: true, isFetching: true }],
    // React Query pauses a first load while offline or in a hidden tab: pending, not fetching.
    ['paused (hidden tab or offline)', { isLoading: false, isFetching: false }],
  ])('shows the feed skeleton while the first load is %s', (_state, flags) => {
    mocks.useNews.mockReturnValue(newsQueryState({ isPending: true, ...flags }));

    renderNews();

    expect(screen.getByText('Loading news…').closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByText("Couldn't load news")).not.toBeInTheDocument();
    expect(screen.queryByText('No news yet')).not.toBeInTheDocument();
  });

  it('shows the full-page error only when nothing has ever loaded', () => {
    mocks.useNews.mockReturnValue(
      newsQueryState({ isError: true, error: new Error('yahoo down') })
    );

    renderNews();

    expect(screen.getByText("Couldn't load news")).toBeInTheDocument();
    expect(screen.getByText('yahoo down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    // Holdings come from the feed, so search waits for it.
    expect(screen.getByRole('combobox', { name: 'Search your holdings' })).toBeDisabled();
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

  describe('holding cards', () => {
    it('shows only the top story under a heading-wrapped "N stories" button', () => {
      mocks.useNews.mockReturnValue(newsQueryState({ data: holdingsNews }));

      renderNews();

      const header = screen.getByRole('button', { name: 'BTC Bitcoin 4 stories' });
      // Heading wraps the button, never the reverse.
      expect(
        screen.getByRole('heading', { level: 3, name: 'BTC Bitcoin 4 stories' })
      ).toContainElement(header);
      // storyCount drives the label; a single story reads singular.
      expect(
        screen.getByRole('button', { name: 'VOO Vanguard S&P 500 ETF 1 story' })
      ).toBeInTheDocument();
      // Only items[0] renders in the feed card (plus its Top stories copy).
      expect(screen.getAllByText('Bitcoin ETF inflows hit a three-week high')).toHaveLength(2);
      expect(screen.queryByText('Miner reserves fall to multi-year lows')).not.toBeInTheDocument();
      // The row keeps its own link and flag controls, outside the header button.
      expect(
        screen.getAllByRole('button', {
          name: 'Flag story: Bitcoin ETF inflows hit a three-week high',
        })
      ).toHaveLength(2);
    });

    it('opens the dossier from a card, then returns focus and scroll with All news', () => {
      mocks.useNews.mockReturnValue(newsQueryState({ data: holdingsNews }));
      mocks.useAssetNews.mockImplementation((assetId: string | null) =>
        newsQueryState(assetId ? { data: btcDossier } : {})
      );
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 });

      renderNews();
      const header = screen.getByRole('button', { name: 'BTC Bitcoin 4 stories' });
      header.focus();
      fireEvent.click(header);

      expect(locationSearch()).toBe('?asset=asset-btc');
      expect(mocks.useAssetNews).toHaveBeenLastCalledWith('asset-btc');
      expect(screen.getByRole('heading', { level: 2, name: 'BTC Bitcoin' })).toHaveFocus();
      expect(screen.queryByText('Top stories')).not.toBeInTheDocument();
      expect(scrollToSpy).toHaveBeenLastCalledWith(0, 0);

      fireEvent.click(screen.getByRole('button', { name: 'All news' }));

      expect(locationSearch()).toBe('');
      expect(screen.getByText('Top stories')).toBeInTheDocument();
      expect(scrollToSpy).toHaveBeenLastCalledWith(0, 640);
      expect(screen.getByRole('button', { name: 'BTC Bitcoin 4 stories' })).toHaveFocus();
      Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    });

    it('pushes history so browser Back returns to the feed', () => {
      mocks.useNews.mockReturnValue(newsQueryState({ data: holdingsNews }));
      mocks.useAssetNews.mockImplementation((assetId: string | null) =>
        newsQueryState(assetId ? { data: btcDossier } : {})
      );

      renderNews();
      fireEvent.click(screen.getByRole('button', { name: 'BTC Bitcoin 4 stories' }));
      expect(screen.getByRole('heading', { level: 2, name: 'BTC Bitcoin' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));

      expect(locationSearch()).toBe('');
      expect(screen.getByRole('button', { name: 'BTC Bitcoin 4 stories' })).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { level: 2, name: 'BTC Bitcoin' })
      ).not.toBeInTheDocument();
    });

    it('lists quiet and not-loaded holdings as shortcuts that open their dossier', () => {
      mocks.useNews.mockReturnValue(newsQueryState({ data: holdingsNews }));

      renderNews();

      const quiet = screen.getByRole('list', { name: 'No headlines in the last 14 days:' });
      expect(
        within(quiet)
          .getAllByRole('button')
          .map((button) => button.textContent)
      ).toEqual(['HYPE Hyperliquid']);
      const unloaded = screen.getByRole('list', { name: 'Also held:' });
      fireEvent.click(within(unloaded).getByRole('button', { name: 'AAPL Apple Inc.' }));

      expect(locationSearch()).toBe('?asset=asset-aapl');
      expect(mocks.useAssetNews).toHaveBeenLastCalledWith('asset-aapl');
    });

    it('keeps sections with no cards useful and skips the page empty state for quiet holdings', () => {
      mocks.useNews.mockReturnValue(
        newsQueryState({
          data: fixtureResponse({
            holdings: [
              fixtureHolding({ assetId: 'asset-hype', symbol: 'HYPE', name: 'Hyperliquid' }),
              fixtureHolding({
                assetId: 'asset-aapl',
                symbol: 'AAPL',
                name: 'Apple Inc.',
                bucket: 'equities',
                loaded: false,
              }),
            ],
          }),
        })
      );

      renderNews();

      expect(screen.queryByText('No news yet')).not.toBeInTheDocument();
      // Crypto: the quiet line replaces the empty text.
      expect(screen.queryByText('No crypto headlines right now')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'HYPE Hyperliquid' })).toBeInTheDocument();
      // Equities: nothing quiet, so the empty text stays alongside "Also held".
      expect(screen.getByText('No equity headlines right now')).toBeInTheDocument();
      expect(screen.getByRole('list', { name: 'Also held:' })).toBeInTheDocument();
    });

    it('still renders an older response without holdings or storyCount', () => {
      mocks.useNews.mockReturnValue(
        newsQueryState({
          data: fixtureResponse({
            crypto: [
              fixtureGroup({
                assetId: 'asset-btc',
                symbol: 'BTC',
                name: 'Bitcoin',
                items: btcStories.slice(0, 2),
              }),
            ],
          }),
        })
      );

      renderNews();

      // storyCount falls back to items.length; no holdings means no shortcuts or search.
      expect(screen.getByRole('button', { name: 'BTC Bitcoin 2 stories' })).toBeInTheDocument();
      expect(screen.getByText('Bitcoin ETF inflows hit a three-week high')).toBeInTheDocument();
      expect(screen.queryByText('No headlines in the last 14 days:')).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });
  });

  describe('holding search', () => {
    // Largest first; ranking must beat this order: symbol prefix, name word, substring.
    const searchNews = fixtureResponse({
      holdings: [
        fixtureHolding({
          assetId: 'asset-hype',
          symbol: 'HYPE',
          name: 'Hyperliquid',
          storyCount: 2,
        }),
        fixtureHolding({ assetId: 'asset-lido', symbol: 'LDO', name: 'Lido DAO' }),
        fixtureHolding({ assetId: 'asset-link', symbol: 'LINK', name: 'Chainlink', loaded: false }),
      ],
    });

    function searchInput() {
      return screen.getByRole('combobox', { name: 'Search your holdings' });
    }

    it('ranks symbol prefix, then name word, then substring, with status meta', () => {
      mocks.useNews.mockReturnValue(newsQueryState({ data: searchNews }));
      renderNews();

      fireEvent.change(searchInput(), { target: { value: 'li' } });

      const listbox = screen.getByRole('listbox', { name: 'Matching holdings' });
      expect(
        within(listbox)
          .getAllByRole('option')
          .map((option) => option.textContent)
      ).toEqual([
        'LINK Chainlink Loads when opened',
        'LDO Lido DAO No recent headlines',
        'HYPE Hyperliquid 2 stories',
      ]);
      expect(searchInput()).toHaveAttribute('aria-expanded', 'true');
    });

    it('caps the list at eight matches', () => {
      mocks.useNews.mockReturnValue(
        newsQueryState({
          data: fixtureResponse({
            holdings: Array.from({ length: 10 }, (_, index) =>
              fixtureHolding({
                assetId: `asset-${index}`,
                symbol: `TK${index}`,
                name: `Token ${index}`,
              })
            ),
          }),
        })
      );
      renderNews();

      fireEvent.change(searchInput(), { target: { value: 'tk' } });

      expect(screen.getAllByRole('option')).toHaveLength(8);
    });

    it('opens the active option with ArrowDown + Enter and resets the search', () => {
      mocks.useNews.mockReturnValue(newsQueryState({ data: searchNews }));
      renderNews();
      const input = searchInput();

      fireEvent.change(input, { target: { value: 'li' } });
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      const active = screen.getByRole('option', { name: 'LDO Lido DAO No recent headlines' });
      expect(active).toHaveAttribute('aria-selected', 'true');
      expect(input).toHaveAttribute('aria-activedescendant', active.id);

      fireEvent.keyDown(input, { key: 'Enter' });

      expect(locationSearch()).toBe('?asset=asset-lido');
      expect(input).toHaveValue('');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('opens the first match on Enter and an option on click', () => {
      mocks.useNews.mockReturnValue(newsQueryState({ data: searchNews }));
      renderNews();
      const input = searchInput();

      fireEvent.change(input, { target: { value: 'hyper' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(locationSearch()).toBe('?asset=asset-hype');

      fireEvent.change(input, { target: { value: 'chain' } });
      const option = screen.getByRole('option', { name: /^LINK Chainlink/ });
      // Mousedown is swallowed so the input keeps focus until the click lands.
      expect(fireEvent.mouseDown(option)).toBe(false);
      fireEvent.click(option);
      expect(locationSearch()).toBe('?asset=asset-link');
    });

    it('returns focus to the search input after a holding opened from search is closed', () => {
      mocks.useNews.mockReturnValue(newsQueryState({ data: searchNews }));
      renderNews();
      const input = searchInput();

      input.focus();
      fireEvent.change(input, { target: { value: 'ldo' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(locationSearch()).toBe('?asset=asset-lido');
      fireEvent.click(screen.getByRole('button', { name: 'All news' }));

      expect(locationSearch()).toBe('');
      expect(searchInput()).toHaveFocus();
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('shows a non-selectable no-match row, and Escape closes then clears', () => {
      mocks.useNews.mockReturnValue(newsQueryState({ data: searchNews }));
      renderNews();
      const input = searchInput();

      fireEvent.change(input, { target: { value: 'zzz' } });

      expect(screen.getByText('No holding matches “zzz”')).toBeInTheDocument();
      expect(screen.queryByRole('option')).not.toBeInTheDocument();
      expect(input).toHaveAttribute('aria-expanded', 'false');
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(locationSearch()).toBe('');

      fireEvent.change(input, { target: { value: 'ldo' } });
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(input).toHaveValue('ldo');
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(input).toHaveValue('');
    });

    it('closes the list on blur', () => {
      mocks.useNews.mockReturnValue(newsQueryState({ data: searchNews }));
      renderNews();
      const input = searchInput();

      fireEvent.change(input, { target: { value: 'ldo' } });
      expect(screen.getByRole('listbox')).toBeInTheDocument();
      fireEvent.blur(input);

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('holding dossier', () => {
    function renderDossier(assetState: Record<string, unknown>) {
      mocks.useNews.mockReturnValue(newsQueryState({ data: holdingsNews }));
      mocks.useAssetNews.mockReturnValue(newsQueryState(assetState));
      return renderNews('/news?asset=asset-btc');
    }

    it('shows a loading state titled from the feed holding while the dossier loads', () => {
      renderDossier({ isPending: true, isLoading: true, isFetching: true });

      expect(screen.getByRole('heading', { level: 2, name: 'BTC Bitcoin' })).toHaveFocus();
      expect(screen.getByText('Loading BTC news…').closest('[role="status"]')).not.toBeNull();
      // The dossier replaces Top stories and the sections.
      expect(screen.queryByText('Top stories')).not.toBeInTheDocument();
      expect(mocks.useAssetNews).toHaveBeenCalledWith('asset-btc');
    });

    it('keeps the loading state while a retry is paused (hidden tab or offline)', () => {
      // React Query pauses retries while unfocused/offline: pending, but not fetching.
      renderDossier({ isPending: true, isLoading: false, isFetching: false });

      expect(screen.getByText('Loading BTC news…').closest('[role="status"]')).not.toBeNull();
    });

    it('shows the server error with a retry', () => {
      const refetch = vi.fn();
      renderDossier({ isError: true, error: new Error('No news feed for this holding'), refetch });

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('No news feed for this holding');
      fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
      expect(refetch).toHaveBeenCalled();
    });

    it('explains an empty window', () => {
      renderDossier({ data: { ...btcDossier, items: [] } });

      expect(screen.getByText('No headlines for BTC in the last 60 days.')).toBeInTheDocument();
    });

    it('lists every story with feed context and a window footer', () => {
      renderDossier({ data: btcDossier });

      for (const item of btcDossier.items) {
        expect(screen.getByText(item.title)).toBeInTheDocument();
      }
      // groupSymbol = the holding, so co-affected holdings still show.
      expect(screen.getByText(/also affects ETH/)).toBeInTheDocument();
      // btc-1 is in the feed's Top stories.
      expect(screen.getAllByText(/in Top stories/)).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: /^Flag story:/ })).toHaveLength(4);
      expect(screen.getByText('4 stories · last 60 days · newest first')).toBeInTheDocument();
    });

    it('refreshes the dossier, not the feed, while a holding is open', () => {
      const feedRefetch = vi.fn();
      const dossierRefetch = vi.fn();
      mocks.useNews.mockReturnValue(newsQueryState({ data: holdingsNews, refetch: feedRefetch }));
      mocks.useAssetNews.mockReturnValue(
        newsQueryState({ data: btcDossier, refetch: dossierRefetch })
      );
      renderNews('/news?asset=asset-btc');

      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

      expect(dossierRefetch).toHaveBeenCalled();
      expect(feedRefetch).not.toHaveBeenCalled();
    });
  });
});

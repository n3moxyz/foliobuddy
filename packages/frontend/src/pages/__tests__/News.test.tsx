import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import News from '../News';
import type { PortfolioNewsResponse } from '@/lib/types';

const mocks = vi.hoisted(() => ({ useNews: vi.fn() }));

vi.mock('@/hooks/useNews', () => ({ useNews: mocks.useNews }));

const loadedNews: PortfolioNewsResponse = {
  crypto: [
    {
      assetId: 'asset-btc',
      symbol: 'BTC',
      name: 'Bitcoin',
      category: 'LIQUID_CRYPTO',
      openTradeOnly: false,
      items: [
        {
          id: 'story-1',
          title: 'Bitcoin story',
          publisher: 'Wire',
          url: 'https://example.com/story-1',
          publishedAt: '2026-08-24T10:00:00.000Z',
        },
      ],
    },
  ],
  equities: [],
  macro: [],
  fetchedAt: '2026-08-24T11:00:00.000Z',
};

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
    mocks.useNews.mockReturnValue(
      newsQueryState({
        data: { crypto: [], equities: [], macro: [], fetchedAt: '2026-08-24T11:00:00.000Z' },
      })
    );

    renderNews();

    expect(screen.getByText('No news yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Portfolio' })).toHaveAttribute(
      'href',
      '/portfolio'
    );
  });
});

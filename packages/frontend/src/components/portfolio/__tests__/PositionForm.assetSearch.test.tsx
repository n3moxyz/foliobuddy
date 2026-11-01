import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';
import { PositionForm } from '../PositionForm';

// Real search hooks against a stubbed API, so the form's wiring is under test.
vi.mock('@/hooks/usePortfolio', () => ({
  useCreatePosition: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePosition: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePositions: () => ({ data: [] }),
  usePortfolioSummary: () => ({ data: undefined }),
  useFxRates: () => ({ data: undefined }),
}));

const offline = () => new TypeError('Failed to fetch');

function renderForm() {
  const Wrapper = createQueryClientWrapper(createTestQueryClient());
  render(
    <Wrapper>
      <PositionForm onSuccess={vi.fn()} />
    </Wrapper>
  );
}

function typeInAssetSearch(value: string) {
  const search = screen.getByRole('combobox', { name: /Asset/ });
  act(() => search.focus());
  fireEvent.change(search, { target: { value } });
  return search;
}

async function findSearchError() {
  const title = await screen.findByText("Couldn't search assets");
  return title.closest('[role="alert"]') as HTMLElement;
}

beforeAll(() => {
  // Radix primitives call these pointer/scroll/resize APIs, which jsdom lacks.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  vi.spyOn(api, 'getAssets').mockResolvedValue([]);
  vi.spyOn(api, 'searchCoins').mockResolvedValue([]);
  vi.spyOn(api, 'searchAssets').mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Add Position asset picker: search states', () => {
  it('shows Searching… during the debounce and the error, not "No matching assets", on failure', async () => {
    vi.mocked(api.searchCoins).mockRejectedValueOnce(offline());
    renderForm();

    typeInAssetSearch('pepe');

    expect(api.searchCoins).not.toHaveBeenCalled();
    expect(screen.getByText('Searching…')).toBeInTheDocument();
    expect(screen.queryByText('No matching assets')).not.toBeInTheDocument();

    const alert = await findSearchError();
    expect(alert).toHaveTextContent('Check your connection and try again.');
    expect(screen.queryByText('No matching assets')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // The retry succeeds with nothing, which is a real "no match".
    expect(await screen.findByText('No matching assets')).toBeInTheDocument();
    expect(screen.queryByText("Couldn't search assets")).not.toBeInTheDocument();
    expect(api.searchCoins).toHaveBeenCalledTimes(2);
    expect(api.searchCoins).toHaveBeenLastCalledWith('pepe');
  });

  it('reports a failed stock search for Equities the same way', async () => {
    vi.mocked(api.searchAssets).mockRejectedValue(offline());
    renderForm();
    const category = screen.getByRole('combobox', { name: 'Category' });
    fireEvent.keyDown(category, { key: 'Enter' });
    fireEvent.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: 'Equities' })
    );
    // Radix returns focus to the trigger after closing; a person then moves to the search.
    await waitFor(() => expect(category).toHaveFocus());

    typeInAssetSearch('  zzzz ');

    await findSearchError();
    expect(screen.queryByText('No matching assets')).not.toBeInTheDocument();
    expect(api.searchAssets).toHaveBeenCalledWith('zzzz', {
      category: 'EQUITY',
      provider: 'yahoo',
    });
    expect(api.searchCoins).not.toHaveBeenCalled();
  });
});

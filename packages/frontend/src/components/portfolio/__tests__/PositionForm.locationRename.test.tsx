import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PositionForm } from '../PositionForm';
import {
  CUSTOM_LOCATION_OPTIONS_KEY,
  customLocationOptionsForStorageType,
} from '../positionOptions';

vi.mock('@/hooks/useAssets', () => ({
  useAssets: () => ({ data: [] }),
  useSearchCoins: () => ({ data: [], isLoading: false }),
  useSearchAssets: () => ({ data: [], isLoading: false }),
  useCreateAssetFromProvider: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateAssetFromCoinGecko: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateAsset: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateUnitTrust: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAssetNav: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/usePortfolio', () => ({
  useCreatePosition: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePosition: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePositions: () => ({ data: [] }),
  usePortfolioSummary: () => ({ data: undefined }),
  useFxRates: () => ({ data: undefined }),
}));

function saveExchanges(names: string[]) {
  localStorage.setItem(CUSTOM_LOCATION_OPTIONS_KEY, JSON.stringify({ CEX: names }));
}

// Same shell as the Add Position dialog on Portfolio, so Escape reaches the real dialog.
function renderAddPositionDialog() {
  const onOpenChange = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Position</DialogTitle>
            <DialogDescription className="sr-only">
              Create a portfolio position manually or import positions from JSON.
            </DialogDescription>
          </DialogHeader>
          <PositionForm onSuccess={vi.fn()} />
        </DialogContent>
      </Dialog>
    </QueryClientProvider>
  );
  return { onOpenChange };
}

async function chooseExchange(name: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Exchange' }), { key: 'Enter' });
  const listbox = await screen.findByRole('listbox');
  fireEvent.click(within(listbox).getByRole('option', { name }));
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
}

async function openRenameBox(name: string) {
  fireEvent.click(screen.getByRole('button', { name: `Rename ${name}` }));
  const renameBox = screen.getByRole('textbox', { name: `New name for ${name}` });
  await waitFor(() => expect(renameBox).toHaveFocus());
  return renameBox;
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
  localStorage.clear();
});

describe('PositionForm: renaming a saved location', () => {
  it('keeps a saved exchange, and its pencil, when only the capitals change', async () => {
    saveExchanges(['kraken']);
    renderAddPositionDialog();
    await chooseExchange('kraken');

    const renameBox = await openRenameBox('kraken');
    fireEvent.change(renameBox, { target: { value: 'Kraken' } });
    fireEvent.keyDown(renameBox, { key: 'Enter' });

    expect(screen.getByRole('combobox', { name: 'Exchange' })).toHaveTextContent('Kraken');
    expect(customLocationOptionsForStorageType('CEX')).toEqual(['Kraken']);
    // Still a saved name: the keyboard controls stay under the field...
    expect(screen.getByRole('button', { name: 'Rename Kraken' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Kraken' })).toBeInTheDocument();

    // ...and the pencil stays on its row in the list, with no lower-case leftover.
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Exchange' }), { key: 'Enter' });
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('button', { name: 'Rename Kraken' })).toBeInTheDocument();
    expect(within(listbox).queryByRole('option', { name: 'kraken' })).not.toBeInTheDocument();
  });

  it('refuses a name already in the list and leaves both saved exchanges alone', async () => {
    saveExchanges(['Kraken', 'OKX']);
    renderAddPositionDialog();
    await chooseExchange('OKX');

    const renameBox = await openRenameBox('OKX');
    fireEvent.change(renameBox, { target: { value: 'binance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't rename OKX. Binance is already in the list."
    );

    fireEvent.change(renameBox, { target: { value: 'kraken' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't rename OKX. Kraken is already in the list."
    );

    expect(customLocationOptionsForStorageType('CEX')).toEqual(['Kraken', 'OKX']);
    expect(screen.getByRole('combobox', { name: 'Exchange' })).toHaveTextContent('OKX');
  });

  it('cancels only the rename on Escape and keeps what was typed in the form', async () => {
    saveExchanges(['Kraken']);
    const { onOpenChange } = renderAddPositionDialog();
    fireEvent.change(screen.getByLabelText('Notes (Optional)'), {
      target: { value: 'Bought after the halving' },
    });
    await chooseExchange('Kraken');

    const renameBox = await openRenameBox('Kraken');
    fireEvent.change(renameBox, { target: { value: 'Kraken Pro' } });
    fireEvent.keyDown(renameBox, { key: 'Escape' });

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Add Position' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /New name for/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Notes (Optional)')).toHaveValue('Bought after the halving');
    expect(screen.getByRole('combobox', { name: 'Exchange' })).toHaveTextContent('Kraken');
    expect(screen.getByRole('combobox', { name: 'Exchange' })).toHaveFocus();
    expect(customLocationOptionsForStorageType('CEX')).toEqual(['Kraken']);
  });
});

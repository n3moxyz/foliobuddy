import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { Asset, Position, ProviderSearchResult } from '@/lib/types';
import { PositionForm } from '../PositionForm';

const providerMutate = vi.fn();
const coingeckoMutate = vi.fn();
const updatePositionMutate = vi.fn();
let catalog: Asset[] = [];
let fxRates: Array<{ fromCcy: string; toCcy: string; rate: number }> | undefined;

vi.mock('@/hooks/useAssets', () => ({
  useAssets: () => ({ data: catalog }),
  useSearchCoins: () => ({ data: [], isLoading: false }),
  useSearchAssets: (query: string) => ({
    data: query ? [stablecoinXHit] : [],
    isLoading: false,
  }),
  useCreateAssetFromProvider: () => ({ mutateAsync: providerMutate, isPending: false }),
  useCreateAssetFromCoinGecko: () => ({ mutateAsync: coingeckoMutate, isPending: false }),
  useCreateAsset: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateUnitTrust: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateAssetNav: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/usePortfolio', () => ({
  useCreatePosition: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePosition: () => ({ mutateAsync: updatePositionMutate, isPending: false }),
  usePositions: () => ({ data: [] }),
  usePortfolioSummary: () => ({ data: undefined }),
  useFxRates: () => ({ data: fxRates }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const stablecoinXHit: ProviderSearchResult = {
  id: 'USDE',
  providerAssetId: 'USDE',
  provider: 'yahoo',
  symbol: 'USDE',
  name: 'StablecoinX Inc.',
  exchange: 'NASDAQ',
  nativeCurrency: 'USD',
  rank: null,
};

function catalogAsset(overrides: Partial<Asset>): Asset {
  return {
    id: 'asset-1',
    coingeckoId: null,
    priceProvider: 'coingecko',
    providerAssetId: null,
    nativeCurrency: 'USD',
    exchange: null,
    factsheetUrl: null,
    isin: null,
    symbol: 'USDE',
    name: 'Ethena USDe',
    category: 'STABLECOIN',
    currentPriceUsd: 1,
    priceUpdatedAt: null,
    ...overrides,
  };
}

const ethenaRow = catalogAsset({
  id: 'ethena',
  coingeckoId: 'ethena-usde',
  providerAssetId: 'ethena-usde',
});
const stablecoinXRow = catalogAsset({
  id: 'stablecoinx',
  priceProvider: 'yahoo',
  providerAssetId: 'USDE',
  name: 'StablecoinX Inc.',
  category: 'EQUITY',
  exchange: 'NASDAQ',
});

function renderForm(position?: Position) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PositionForm onSuccess={vi.fn()} position={position} />
    </QueryClientProvider>
  );
}

// Radix Select opens from the keyboard in jsdom; pick an option by its label.
async function chooseSelectOption(triggerName: string, optionName: string) {
  const trigger = screen.getByRole('combobox', { name: triggerName });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  const listbox = await screen.findByRole('listbox');
  fireEvent.click(within(listbox).getByRole('option', { name: optionName }));
}

async function pickStablecoinXFromEquitySearch() {
  renderForm();
  await chooseSelectOption('Category', 'Equities');
  const search = screen.getByRole('combobox', { name: /Asset/ });
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: 'USDE' } });
  fireEvent.click(await screen.findByRole('option', { name: /StablecoinX Inc\./ }));
  await waitFor(() => expect(providerMutate).toHaveBeenCalled());
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
  vi.clearAllMocks();
  catalog = [ethenaRow];
  fxRates = undefined;
});

describe('PositionForm: native cost persistence', () => {
  const asset = catalogAsset({
    id: 'native-asset',
    symbol: 'TEST.KS',
    name: 'Fictional native equity',
    category: 'EQUITY',
    nativeCurrency: 'KRW',
    priceProvider: 'yahoo',
    providerAssetId: 'TEST.KS',
  });
  const position = {
    id: 'native-position',
    assetId: asset.id,
    asset,
    quantity: 10,
    avgCostUsd: 35.00010288,
    avgCostNative: 42_000.123456,
    costCurrency: 'KRW',
    recordedAvgCostUsd: 37,
    storageType: 'BROKERAGE',
    storageLocation: 'IBKR',
    notes: null,
    custodyOf: null,
  } as Position;

  beforeEach(() => {
    catalog = [asset];
    fxRates = [{ fromCcy: 'USD', toCcy: 'KRW', rate: 1200 }];
    updatePositionMutate.mockResolvedValue(position);
  });

  it('retains the exact native average and original USD ledger on a notes-only edit', async () => {
    renderForm(position);
    fireEvent.change(screen.getByLabelText('Notes (Optional)'), {
      target: { value: 'Updated note' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Position' }));
    await waitFor(() => expect(updatePositionMutate).toHaveBeenCalled());
    expect(updatePositionMutate).toHaveBeenCalledWith({
      id: position.id,
      data: expect.objectContaining({ avgCostNative: 42_000.123456, avgCostUsd: 37 }),
    });
  });

  it('saves a corrected native total without replacing the old USD ledger at current FX', async () => {
    renderForm(position);
    fireEvent.change(screen.getByLabelText('Total Cost (KRW)'), {
      target: { value: '410000.123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Position' }));
    await waitFor(() => expect(updatePositionMutate).toHaveBeenCalled());
    expect(updatePositionMutate).toHaveBeenCalledWith({
      id: position.id,
      data: expect.objectContaining({ avgCostNative: 41_000.0123456, avgCostUsd: 37 }),
    });
  });

  it('leaves a legacy position without an invented native baseline on a notes-only edit', async () => {
    renderForm({
      ...position,
      avgCostNative: null,
      costCurrency: null,
      recordedAvgCostUsd: undefined,
    });
    fireEvent.change(screen.getByLabelText('Notes (Optional)'), {
      target: { value: 'Legacy note' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update Position' }));
    await waitFor(() => expect(updatePositionMutate).toHaveBeenCalled());
    expect(updatePositionMutate.mock.calls[0][0].data).not.toHaveProperty('avgCostNative');
    expect(updatePositionMutate.mock.calls[0][0].data.avgCostUsd).toBe(position.avgCostUsd);
  });
});

describe('PositionForm: server returns a different asset than was picked', () => {
  it('refuses a stock pick resolved to the same-ticker stablecoin (the StablecoinX incident)', async () => {
    providerMutate.mockResolvedValue(ethenaRow);

    await pickStablecoinXFromEquitySearch();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't select StablecoinX Inc.", {
        description: expect.stringContaining('Ethena USDe (Cash)'),
      })
    );
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(/Ethena USDe/)).not.toBeInTheDocument();
  });

  it('selects the stock when the server returns it', async () => {
    providerMutate.mockResolvedValue(stablecoinXRow);

    await pickStablecoinXFromEquitySearch();

    expect(await screen.findByRole('button', { name: 'Change' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('USDE - StablecoinX Inc.')).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('refuses a Cash stablecoin resolved to a same-ticker stock and clears the type', async () => {
    catalog = [];
    coingeckoMutate.mockResolvedValue(stablecoinXRow);
    renderForm();

    await chooseSelectOption('Category', 'Cash');
    await chooseSelectOption('Type', 'USDe');

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't select Ethena USDe", {
        description: expect.stringContaining('StablecoinX Inc. (Equities)'),
      })
    );
    expect(coingeckoMutate).toHaveBeenCalledWith(
      expect.objectContaining({ coingeckoId: 'ethena-usde', category: 'STABLECOIN' })
    );
    expect(screen.getByRole('combobox', { name: 'Type' })).not.toHaveTextContent('USDe');
  });

  it('keeps the Cash stablecoin when the server returns it', async () => {
    catalog = [];
    coingeckoMutate.mockResolvedValue(ethenaRow);
    renderForm();

    await chooseSelectOption('Category', 'Cash');
    await chooseSelectOption('Type', 'USDe');

    await waitFor(() => expect(coingeckoMutate).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent('USDe')
    );
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('PositionForm: picking an unpriced equity', () => {
  const deadNbis = catalogAsset({
    id: 'dead-nbis',
    symbol: 'NBIS',
    name: 'Nebius Group',
    category: 'EQUITY',
    exchange: 'NASDAQ',
  });
  const liveNbis = catalogAsset({
    id: 'live-nbis',
    symbol: 'NBIS',
    name: 'Nebius Group N.V.',
    category: 'EQUITY',
    priceProvider: 'yahoo',
    providerAssetId: 'NBIS',
  });

  async function pickDeadNbis() {
    catalog = [deadNbis];
    renderForm();
    await chooseSelectOption('Category', 'Equities');
    const search = screen.getByRole('combobox', { name: /Asset/ });
    fireEvent.focus(search);
    fireEvent.change(search, { target: { value: 'NBIS' } });
    fireEvent.click(await screen.findByRole('option', { name: /Nebius Group/ }));
    await waitFor(() => expect(providerMutate).toHaveBeenCalled());
  }

  it('asks for the Yahoo identity only and moves to the live listing that holds it', async () => {
    providerMutate.mockResolvedValue(liveNbis);

    await pickDeadNbis();

    // No stale exchange or currency: they would overwrite the shared live row.
    expect(providerMutate).toHaveBeenCalledWith({
      provider: 'yahoo',
      providerAssetId: 'NBIS',
      symbol: 'NBIS',
      name: 'Nebius Group',
      category: 'EQUITY',
    });
    expect(await screen.findByDisplayValue('NBIS - Nebius Group N.V.')).toBeInTheDocument();
  });

  it('keeps the picked row when the repair returns an unrelated asset', async () => {
    providerMutate.mockResolvedValue(ethenaRow);

    await pickDeadNbis();

    await waitFor(() => expect(providerMutate).toHaveBeenCalledTimes(1));
    expect(screen.getByDisplayValue('NBIS - Nebius Group')).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/Ethena/)).not.toBeInTheDocument();
  });
});

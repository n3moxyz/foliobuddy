import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import type { ParsedStatementHolding } from '@/lib/types';
import { MASKED_MONEY_VALUE, usePrivacyStore } from '@/stores/privacyStore';
import { PositionForm } from '../PositionForm';

vi.mock('@/lib/api', () => ({ api: { parseUnitTrustStatement: vi.fn() } }));
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

const alphaFund: ParsedStatementHolding = {
  symbol: 'ALPHA',
  name: 'Fictional Alpha Fund',
  isin: 'SG9999000011',
  nativeCurrency: 'SGD',
  units: 1234.5678,
  avgCostNative: 1.1,
  navNative: 1.2345,
  navUsd: 0.9213,
  currentValueNative: 1524.07,
  totalCostNative: 1358.02,
  totalCostUsd: 1013.49,
  fxRateToUsd: 0.7463,
  navAsOfDate: '2026-09-30',
  yahooSymbol: null,
};
const betaFund: ParsedStatementHolding = {
  symbol: 'BETA',
  name: 'Fictional Beta Fund',
  isin: 'LU9999000022',
  nativeCurrency: 'USD',
  units: 50,
  avgCostNative: 10,
  navNative: 10.5,
  navUsd: 10.5,
  currentValueNative: 525,
  totalCostNative: 500,
  totalCostUsd: 500,
  fxRateToUsd: 1,
  navAsOfDate: '2026-09-30',
  yahooSymbol: null,
};

// Radix Select opens from the keyboard in jsdom; pick an option by its label.
async function chooseSelectOption(triggerName: string, optionName: string) {
  const trigger = screen.getByRole('combobox', { name: triggerName });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  const listbox = await screen.findByRole('listbox');
  fireEvent.click(within(listbox).getByRole('option', { name: optionName }));
}

/** Uploads a multi-holding statement in Add Position and returns the picker's holding buttons. */
async function uploadStatement() {
  vi.mocked(api.parseUnitTrustStatement).mockResolvedValue({
    broker: 'FSMOne',
    periodEnd: '2026-09-30',
    holdings: [alphaFund, betaFund],
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PositionForm onSuccess={vi.fn()} />
    </QueryClientProvider>
  );
  await chooseSelectOption('Category', 'Equities');
  fireEvent.click(screen.getByRole('button', { name: 'Unit Trust' }));
  const statement = new File(['%PDF-1.4'], 'statement.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByLabelText(/Upload Monthly Statement/), {
    target: { files: [statement] },
  });
  const alpha = await screen.findByRole('button', { name: /Fictional Alpha Fund/ });
  const beta = screen.getByRole('button', { name: /Fictional Beta Fund/ });
  return { alpha, beta };
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
  vi.mocked(api.parseUnitTrustStatement).mockReset();
});

afterEach(() => act(() => usePrivacyStore.getState().setValuesHidden(false)));

describe('PositionForm: statement holding picker privacy', () => {
  it('masks parsed units while values are hidden and keeps the published NAV visible', async () => {
    usePrivacyStore.getState().setValuesHidden(true);
    const { alpha, beta } = await uploadStatement();

    const alphaDetails = within(alpha).getByText(/units/);
    const betaDetails = within(beta).getByText(/units/);
    expect(alphaDetails.textContent).toBe(
      `${MASKED_MONEY_VALUE} units · NAV SGD 1.2345 · SG9999000011`
    );
    expect(betaDetails.textContent).toBe(
      `${MASKED_MONEY_VALUE} units · NAV USD 10.5 · LU9999000022`
    );
    expect(document.body).not.toHaveTextContent(/1,?234\.5/);

    act(() => usePrivacyStore.getState().toggleValuesHidden());
    expect(alphaDetails.textContent).toBe('1,234.568 units · NAV SGD 1.2345 · SG9999000011');
    expect(betaDetails.textContent).toBe('50 units · NAV USD 10.5 · LU9999000022');
  });

  it('prefills the picked units into the editable input, which stays visible while hidden', async () => {
    usePrivacyStore.getState().setValuesHidden(true);
    const { alpha } = await uploadStatement();

    fireEvent.click(alpha);

    expect(screen.queryByRole('button', { name: /Fictional Beta Fund/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Units')).toHaveValue('1,234.5678');
  });
});

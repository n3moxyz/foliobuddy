import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { installAuthSession } from '@/lib/authSession';
import type { BulkImportPosition, BulkImportResult } from '@/lib/types';
import { usePrivacyStore } from '@/stores/privacyStore';
import { PositionForm } from '../PositionForm';

vi.mock('@/lib/api', () => ({ api: { bulkImportPositions: vi.fn() } }));
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

const nativePosition: BulkImportPosition = {
  asset: {
    coingeckoId: null,
    symbol: 'TEST.KS',
    name: 'Fictional native equity',
    category: 'EQUITY',
    priceProvider: 'yahoo',
    providerAssetId: 'TEST.KS',
    nativeCurrency: 'KRW',
    exchange: 'KSC',
    isin: 'KR7000000001',
  },
  quantity: 1234.56789,
  avgCostUsd: 35.00010288,
  avgCostNative: 42000.123456,
  costCurrency: 'KRW',
  storageType: 'BROKERAGE',
  storageLocation: 'IBKR',
  notes: 'First import row',
  custodyOf: 'Alice',
};
const secondPosition = { ...nativePosition, quantity: 2.3456789, notes: 'Second import row' };
const thirdPosition = { ...nativePosition, quantity: 3.456789, notes: 'Third import row' };
const batch = [nativePosition, secondPosition, thirdPosition];

function success(rows: BulkImportPosition[]): BulkImportResult {
  return {
    results: rows.map((row) => ({ symbol: row.asset.symbol, success: true })),
    successCount: rows.length,
    totalCount: rows.length,
  };
}

const partialResult: BulkImportResult = {
  results: [
    { symbol: nativePosition.asset.symbol, success: true },
    { symbol: secondPosition.asset.symbol, success: false, error: 'Temporary row failure' },
    { symbol: thirdPosition.asset.symbol, success: false, error: 'Temporary row failure' },
  ],
  successCount: 1,
  totalCount: 3,
};

function deferredImport() {
  let resolve!: (value: BulkImportResult) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<BulkImportResult>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function openImport(rows = [nativePosition]) {
  const onSuccess = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <PositionForm onSuccess={onSuccess} existingCustodyNames={['Alice', 'Bob']} />
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  const editor = screen.getByRole('textbox', { name: 'Position JSON to import' });
  const json = JSON.stringify(rows, null, 2);
  fireEvent.change(editor, { target: { value: json } });
  return { editor, json, onSuccess, unmount: rendered.unmount };
}

function submitImport() {
  fireEvent.click(screen.getByRole('button', { name: /^Import \d+ Positions?$/ }));
}

beforeAll(() => {
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
  vi.mocked(api.bulkImportPositions).mockReset();
  usePrivacyStore.setState({ valuesHidden: false });
  installAuthSession('import-recovery-user', 'import-recovery-session', async () => null, 'local');
});

afterEach(() => vi.restoreAllMocks());

describe('PositionForm import recovery', () => {
  it('retries an unchanged network failure with the same request ID and exact native/custody values', async () => {
    const importPositions = vi.mocked(api.bulkImportPositions);
    importPositions
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce(success([nativePosition]));
    const { editor, json, onSuccess } = openImport();

    submitImport();
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
    expect(editor).toHaveValue(json);
    submitImport();

    await screen.findByText('1 imported successfully');
    expect(importPositions).toHaveBeenCalledTimes(2);
    const [firstRows, firstId] = importPositions.mock.calls[0];
    expect(firstRows).toEqual([nativePosition]);
    expect(firstId).toEqual(expect.any(String));
    expect(importPositions.mock.calls[1]).toEqual([firstRows, firstId]);
    expect(onSuccess).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close Import' }));
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('starts a new request ID after the failed input changes', async () => {
    const importPositions = vi.mocked(api.bulkImportPositions);
    const corrected = { ...nativePosition, avgCostNative: 42000.987654321 };
    importPositions
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce(success([corrected]));
    const { editor } = openImport();
    submitImport();
    await screen.findByRole('alert');

    fireEvent.change(editor, { target: { value: JSON.stringify([corrected]) } });
    submitImport();

    await screen.findByText('1 imported successfully');
    expect(importPositions.mock.calls[1][0]).toEqual([corrected]);
    expect(importPositions.mock.calls[1][1]).not.toBe(importPositions.mock.calls[0][1]);
  });

  it('retains an uncertain import ID through dialog unmount and reopening', async () => {
    const importPositions = vi.mocked(api.bulkImportPositions);
    importPositions
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce(success([nativePosition]));
    const first = openImport();
    submitImport();
    await screen.findByRole('alert');
    first.unmount();

    openImport();
    submitImport();

    await screen.findByText('1 imported successfully');
    expect(importPositions).toHaveBeenCalledTimes(2);
    expect(importPositions.mock.calls[1]).toEqual(importPositions.mock.calls[0]);
  });

  it('starts a new identical import after the previous batch was fully acknowledged', async () => {
    const importPositions = vi.mocked(api.bulkImportPositions);
    importPositions.mockResolvedValue(success([nativePosition]));
    const first = openImport();
    submitImport();
    await screen.findByText('1 imported successfully');
    fireEvent.click(screen.getByRole('button', { name: 'Close Import' }));
    first.unmount();

    openImport();
    submitImport();

    await screen.findByText('1 imported successfully');
    expect(importPositions.mock.calls[1][0]).toEqual(importPositions.mock.calls[0][0]);
    expect(importPositions.mock.calls[1][1]).not.toBe(importPositions.mock.calls[0][1]);
  });

  it('keeps an unacknowledged successful import ID when its dialog closes', async () => {
    const importPositions = vi.mocked(api.bulkImportPositions);
    importPositions.mockResolvedValue(success([nativePosition]));
    const first = openImport();
    submitImport();
    await screen.findByText('1 imported successfully');
    first.unmount();

    openImport();
    submitImport();

    await screen.findByText('1 imported successfully');
    expect(importPositions.mock.calls[1]).toEqual(importPositions.mock.calls[0]);
  });

  it('ignores a late success from an unmounted form and retains the overlapping retry ID', async () => {
    const importPositions = vi.mocked(api.bulkImportPositions);
    const firstPending = deferredImport();
    const secondPending = deferredImport();
    importPositions
      .mockResolvedValue(success([nativePosition]))
      .mockReturnValueOnce(firstPending.promise)
      .mockReturnValueOnce(secondPending.promise);
    const first = openImport();
    submitImport();
    const originalId = importPositions.mock.calls[0][1];
    first.unmount();
    const second = openImport();
    submitImport();
    expect(importPositions.mock.calls[1][1]).toBe(originalId);

    await act(async () => firstPending.resolve(success([nativePosition])));
    expect(first.onSuccess).not.toHaveBeenCalled();
    expect(second.editor).toBeDisabled();
    expect(screen.queryByText('1 imported successfully')).not.toBeInTheDocument();
    await act(async () => secondPending.reject(new Error('Second response lost')));
    expect(screen.getByRole('alert')).toHaveTextContent('Second response lost');
    submitImport();

    await screen.findByText('1 imported successfully');
    expect(importPositions.mock.calls[2][1]).toBe(originalId);
    expect(second.onSuccess).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close Import' }));
    expect(second.onSuccess).toHaveBeenCalledTimes(1);
    second.unmount();
    openImport();
    submitImport();

    await screen.findByText('1 imported successfully');
    expect(importPositions.mock.calls[3][1]).not.toBe(originalId);
  });

  it('does not reuse a mounted attempt ID after the authenticated session changes', async () => {
    const importPositions = vi.mocked(api.bulkImportPositions);
    importPositions
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValueOnce(success([nativePosition]));
    openImport();
    submitImport();
    await screen.findByRole('alert');
    installAuthSession('different-user', 'different-session', async () => null, 'local');

    submitImport();

    await screen.findByText('1 imported successfully');
    expect(importPositions.mock.calls[1][1]).not.toBe(importPositions.mock.calls[0][1]);
  });

  it('retries partial results with the unchanged full batch and its original ID', async () => {
    const importPositions = vi.mocked(api.bulkImportPositions);
    importPositions.mockResolvedValueOnce(partialResult).mockResolvedValueOnce(success(batch));
    openImport(batch);
    submitImport();
    await screen.findByText('1 imported successfully, 2 failed');

    fireEvent.click(screen.getByRole('button', { name: 'Retry failed import' }));

    await screen.findByText('3 imported successfully');
    expect(importPositions).toHaveBeenCalledTimes(2);
    expect(importPositions.mock.calls[1]).toEqual(importPositions.mock.calls[0]);
    expect(importPositions.mock.calls[1][0]).toEqual(batch);
    expect(screen.queryByRole('button', { name: 'Retry failed import' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit failed rows' })).not.toBeInTheDocument();
  });

  it('edits only failed indexes, preserving custody and native precision, then starts a new request ID', async () => {
    const importPositions = vi.mocked(api.bulkImportPositions);
    importPositions.mockResolvedValueOnce(partialResult);
    openImport(batch);
    submitImport();
    await screen.findByText('1 imported successfully, 2 failed');

    fireEvent.click(screen.getByRole('button', { name: 'Edit failed rows' }));

    const editor = screen.getByRole('textbox', { name: 'Position JSON to import' });
    expect(JSON.parse((editor as HTMLTextAreaElement).value)).toEqual([
      secondPosition,
      thirdPosition,
    ]);
    const correctedRows = [{ ...secondPosition, storageLocation: 'Tiger' }, thirdPosition];
    fireEvent.change(editor, { target: { value: JSON.stringify(correctedRows) } });
    importPositions.mockResolvedValueOnce(success(correctedRows));
    submitImport();

    await screen.findByText('2 imported successfully');
    expect(importPositions.mock.calls[1][0]).toEqual(correctedRows);
    expect(importPositions.mock.calls[1][1]).not.toBe(importPositions.mock.calls[0][1]);
  });

  it('blocks repeated submissions and disables JSON edits and mode changes while pending', async () => {
    const importPositions = vi.mocked(api.bulkImportPositions);
    const pending = deferredImport();
    importPositions.mockReturnValueOnce(pending.promise);
    const { editor, json } = openImport();
    const submit = screen.getByRole('button', { name: 'Import 1 Position' });
    const paste = screen.getByRole('button', { name: 'Paste from Clipboard' });
    const addNew = screen.getByRole('button', { name: 'Add New' });

    act(() => {
      fireEvent.click(submit);
      fireEvent.click(submit);
      fireEvent.change(editor, { target: { value: JSON.stringify([secondPosition]) } });
      fireEvent.click(addNew);
    });

    expect(importPositions).toHaveBeenCalledTimes(1);
    expect(editor).toHaveValue(json);
    expect(editor).toBeDisabled();
    expect(paste).toBeDisabled();
    expect(addNew).toBeDisabled();
    expect(submit).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Custody: held for someone else' })).toBeDisabled();

    await act(async () => pending.resolve(success([nativePosition])));
    expect(screen.getByText('1 imported successfully')).toBeInTheDocument();
  });

  it('blocks all recovery controls during retry, shows retry errors, and retains the original ID', async () => {
    const importPositions = vi.mocked(api.bulkImportPositions);
    const pending = deferredImport();
    importPositions
      .mockResolvedValueOnce(partialResult)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(success(batch));
    const { onSuccess } = openImport(batch);
    submitImport();
    await screen.findByText('1 imported successfully, 2 failed');
    const retry = screen.getByRole('button', { name: 'Retry failed import' });
    const edit = screen.getByRole('button', { name: 'Edit failed rows' });
    const done = screen.getByRole('button', { name: 'Close Import' });

    act(() => {
      fireEvent.click(retry);
      fireEvent.click(retry);
      fireEvent.click(edit);
      fireEvent.click(done);
    });

    expect(importPositions).toHaveBeenCalledTimes(2);
    expect(retry).toBeDisabled();
    expect(edit).toBeDisabled();
    expect(done).toBeDisabled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('textbox', { name: 'Position JSON to import' })
    ).not.toBeInTheDocument();

    await act(async () => pending.reject(new Error('Retry connection lost')));
    expect(screen.getByRole('alert')).toHaveTextContent('Retry connection lost');
    expect(retry).toBeEnabled();
    expect(edit).toBeEnabled();
    expect(done).toBeEnabled();
    fireEvent.click(retry);

    await screen.findByText('3 imported successfully');
    expect(importPositions.mock.calls[1]).toEqual(importPositions.mock.calls[0]);
    expect(importPositions.mock.calls[2]).toEqual(importPositions.mock.calls[0]);
  });

  it('renders repeated symbols and identical failed rows without duplicate React keys', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(api.bulkImportPositions).mockResolvedValueOnce(partialResult);
    openImport([nativePosition, secondPosition, secondPosition]);
    submitImport();

    await screen.findByText('1 imported successfully, 2 failed');
    expect(screen.getAllByText('Temporary row failure')).toHaveLength(2);
    expect(
      consoleError.mock.calls.some((args) =>
        args.some((arg) => typeof arg === 'string' && arg.includes('same key'))
      )
    ).toBe(false);
  });

  it('keeps the submitted custody override when failed rows return to the editor', async () => {
    const importPositions = vi.mocked(api.bulkImportPositions);
    importPositions.mockResolvedValueOnce({
      results: [
        { symbol: nativePosition.asset.symbol, success: false, error: 'Temporary row failure' },
      ],
      successCount: 0,
      totalCount: 1,
    });
    openImport();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Custody: held for someone else' }));
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Custody person' }), { key: 'Enter' });
    fireEvent.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: 'Bob' })
    );
    submitImport();
    await screen.findByText('0 imported successfully, 1 failed');
    fireEvent.click(screen.getByRole('button', { name: 'Edit failed rows' }));

    const editor = screen.getByRole('textbox', { name: 'Position JSON to import' });
    expect(JSON.parse((editor as HTMLTextAreaElement).value)).toEqual([
      { ...nativePosition, custodyOf: 'Bob' },
    ]);
    expect(importPositions.mock.calls[0][0][0]).toEqual({ ...nativePosition, custodyOf: 'Bob' });
    expect(screen.getByRole('checkbox', { name: 'Custody: held for someone else' })).toBeChecked();
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Custody person' })).toHaveTextContent('Bob')
    );
  });
});

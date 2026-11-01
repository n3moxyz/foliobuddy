import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { installAuthSession } from '@/lib/authSession';
import type { BulkImportPosition, BulkImportResult } from '@/lib/types';
import { usePrivacyStore } from '@/stores/privacyStore';
import { PositionForm } from '../PositionForm';

const resultActions = vi.hoisted(() => ({ editFailed: undefined as (() => void) | undefined }));

vi.mock('@/components/ui/ImportResultsList', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/ImportResultsList')>();
  return {
    ...actual,
    ImportResultsList: (props: Parameters<typeof actual.ImportResultsList>[0]) => {
      resultActions.editFailed = props.onEditFailed;
      return <actual.ImportResultsList {...props} />;
    },
  };
});
vi.mock('@/lib/api', () => ({ api: { bulkImportPositions: vi.fn() } }));
vi.mock('@/hooks/useAssets', () => ({
  useAssets: () => ({ data: [] }),
  useSearchCoins: () => ({ data: [], isSearching: false, isError: false, retry: vi.fn() }),
  useSearchAssets: () => ({ data: [], isSearching: false, isError: false, retry: vi.fn() }),
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
  fireEvent.click(
    screen.getByRole('button', { name: /^(Import \d+ Positions?|Retry Interrupted Import)$/ })
  );
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
  sessionStorage.clear();
  vi.mocked(api.bulkImportPositions).mockReset();
  resultActions.editFailed = undefined;
  usePrivacyStore.setState({ valuesHidden: false });
  installAuthSession('import-recovery-user', 'import-recovery-session', async () => null, 'local');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PositionForm import recovery', () => {
  it('offers an explicit recovery after the runtime identity reinstalls and preserves the saved payload', async () => {
    const importPositions = vi.mocked(api.bulkImportPositions);
    importPositions
      .mockRejectedValueOnce(new Error('Response lost'))
      .mockResolvedValueOnce(success([nativePosition]));
    const first = openImport();
    submitImport();
    await screen.findByText('Response lost');
    const [rows, requestId] = importPositions.mock.calls[0];
    first.unmount();
    installAuthSession(
      'import-recovery-user',
      'import-recovery-session',
      async () => null,
      'local'
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PositionForm onSuccess={vi.fn()} />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(importPositions).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Resume Interrupted Import' }));
    const editor = screen.getByRole('textbox', { name: 'Position JSON to import' });
    expect(editor).toHaveAttribute('readonly');
    expect(JSON.parse((editor as HTMLTextAreaElement).value)).toEqual(rows);
    fireEvent.click(screen.getByRole('button', { name: 'Retry Interrupted Import' }));
    await screen.findByText('1 imported successfully');
    expect(importPositions.mock.calls[1]).toEqual([rows, requestId]);
    fireEvent.click(screen.getByRole('button', { name: 'Close Import' }));
    expect(sessionStorage.getItem('foliobuddy-pending-position-imports-v1')).toBeNull();
  });
  it('does not dispatch when a recovery record cannot be saved', async () => {
    openImport();
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('Quota');
      },
    });
    submitImport();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Import recovery could not be saved'
    );
    expect(api.bulkImportPositions).not.toHaveBeenCalled();
  });
  it('ignores a clipboard read completed after choosing an interrupted import', async () => {
    const importPositions = vi.mocked(api.bulkImportPositions);
    importPositions.mockRejectedValueOnce(new Error('Response lost'));
    const first = openImport();
    submitImport();
    await screen.findByText('Response lost');
    first.unmount();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <PositionForm onSuccess={vi.fn()} />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    let resolve!: (text: string) => void;
    vi.stubGlobal('navigator', {
      clipboard: {
        readText: () =>
          new Promise<string>((done) => {
            resolve = done;
          }),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Paste from Clipboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resume Interrupted Import' }));
    await act(async () => resolve(JSON.stringify([secondPosition])));
    const editor = screen.getByRole('textbox', { name: 'Position JSON to import' });
    expect(JSON.parse((editor as HTMLTextAreaElement).value)).toEqual([nativePosition]);
    act(() => usePrivacyStore.setState({ valuesHidden: true }));
    expect(editor).toHaveValue(
      'Import data hidden. Show monetary values to review the original JSON.'
    );
    expect(editor).not.toHaveValue(expect.stringContaining(String(nativePosition.quantity)));
  });
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

  it('keeps uncertain input locked and replays its original identity until acknowledged', async () => {
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
    expect(editor).toHaveAttribute('readonly');
    expect(importPositions.mock.calls[1][0]).toEqual([nativePosition]);
    expect(importPositions.mock.calls[1][1]).toBe(importPositions.mock.calls[0][1]);
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

  it('blocks a mounted import attempt after the authenticated session changes', async () => {
    const importPositions = vi.mocked(api.bulkImportPositions);
    importPositions.mockRejectedValueOnce(new Error('Connection lost'));
    openImport();
    submitImport();
    await screen.findByRole('alert');
    installAuthSession('different-user', 'different-session', async () => null, 'local');

    submitImport();

    await screen.findByText(
      'The signed-in account changed. Reopen Import from the current account.'
    );
    expect(importPositions).toHaveBeenCalledTimes(1);
  });

  it('retries partial results with the unchanged full batch and its original ID', async () => {
    const importPositions = vi.mocked(api.bulkImportPositions);
    importPositions.mockResolvedValueOnce(partialResult).mockResolvedValueOnce(success(batch));
    openImport(batch);
    submitImport();
    await screen.findByText('1 imported successfully, 2 failed');

    fireEvent.click(screen.getByRole('button', { name: 'Retry Failed Import' }));

    await screen.findByText('3 imported successfully');
    expect(importPositions).toHaveBeenCalledTimes(2);
    expect(importPositions.mock.calls[1]).toEqual(importPositions.mock.calls[0]);
    expect(importPositions.mock.calls[1][0]).toEqual(batch);
    expect(screen.queryByRole('button', { name: 'Retry Failed Import' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit Failed Rows' })).not.toBeInTheDocument();
  });

  it('edits only failed indexes, preserving custody and native precision, then starts a new request ID', async () => {
    const importPositions = vi.mocked(api.bulkImportPositions);
    importPositions.mockResolvedValueOnce(partialResult);
    openImport(batch);
    submitImport();
    await screen.findByText('1 imported successfully, 2 failed');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Failed Rows' }));

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
    expect(
      screen.queryByRole('checkbox', { name: 'Custody: held for someone else' })
    ).not.toBeInTheDocument();

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
    const retry = screen.getByRole('button', { name: 'Retry Failed Import' });
    const edit = screen.getByRole('button', { name: 'Edit Failed Rows' });
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
    expect(edit).toBeDisabled();
    expect(done).toBeEnabled();
    fireEvent.click(retry);

    await screen.findByText('3 imported successfully');
    expect(importPositions.mock.calls[1]).toEqual(importPositions.mock.calls[0]);
    expect(importPositions.mock.calls[2]).toEqual(importPositions.mock.calls[0]);
  });

  it('blocks stale failed-row editing after a committed retry loses its response until same-ID replay is confirmed', async () => {
    const importPositions = vi.mocked(api.bulkImportPositions);
    const rows = [nativePosition, secondPosition];
    const partial: BulkImportResult = {
      results: [
        { symbol: nativePosition.asset.symbol, success: true },
        { symbol: secondPosition.asset.symbol, success: false, error: 'Initial row failure' },
      ],
      successCount: 1,
      totalCount: 2,
    };
    importPositions
      .mockResolvedValueOnce(partial)
      .mockRejectedValueOnce(new Error('Committed retry response lost'))
      .mockResolvedValue(success(rows));
    const rendered = openImport(rows);
    submitImport();
    await screen.findByText('1 imported successfully, 1 failed');
    const edit = screen.getByRole('button', { name: 'Edit Failed Rows' });
    fireEvent.click(screen.getByRole('button', { name: 'Retry Failed Import' }));
    await screen.findByText('Committed retry response lost');

    expect(edit).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Some rows may already be saved. Retry the original batch to check the latest result before editing.'
    );
    expect(
      screen.getByText('Last confirmed result: 1 imported successfully, 1 failed')
    ).toBeInTheDocument();
    fireEvent.click(edit);
    // The parent must also refuse a direct callback from a child with stale controls.
    act(() => resultActions.editFailed?.());
    expect(
      screen.queryByRole('textbox', { name: 'Position JSON to import' })
    ).not.toBeInTheDocument();
    expect(importPositions).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Retry Original Batch' }));

    await screen.findByText('2 imported successfully');
    expect(importPositions.mock.calls[1]).toEqual(importPositions.mock.calls[0]);
    expect(importPositions.mock.calls[2]).toEqual(importPositions.mock.calls[0]);
    expect(rendered.onSuccess).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close Import' }));
    expect(rendered.onSuccess).toHaveBeenCalledTimes(1);
    rendered.unmount();
    openImport(rows);
    submitImport();

    await screen.findByText('2 imported successfully');
    expect(importPositions.mock.calls[3][1]).not.toBe(importPositions.mock.calls[0][1]);
  });

  it('keeps failed-row editing blocked when a retry response does not account for the full original batch', async () => {
    const importPositions = vi.mocked(api.bulkImportPositions);
    importPositions
      .mockResolvedValueOnce(partialResult)
      .mockResolvedValueOnce({
        results: [{ symbol: nativePosition.asset.symbol, success: true }],
        successCount: 1,
        totalCount: batch.length,
      })
      .mockResolvedValueOnce(success(batch));
    openImport(batch);
    submitImport();
    await screen.findByText('1 imported successfully, 2 failed');
    fireEvent.click(screen.getByRole('button', { name: 'Retry Failed Import' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The import response was incomplete'
    );
    expect(screen.getByRole('button', { name: 'Edit Failed Rows' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Original Batch' }));

    await screen.findByText('3 imported successfully');
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
    fireEvent.click(screen.getByRole('button', { name: 'Edit Failed Rows' }));

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

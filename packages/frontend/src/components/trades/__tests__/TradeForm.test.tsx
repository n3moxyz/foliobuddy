import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, Trade } from '@/lib/types';
import { usePrivacyStore } from '@/stores/privacyStore';
import { TradeForm } from '../TradeForm';

const { createTrade, updateTrade } = vi.hoisted(() => ({
  createTrade: vi.fn(),
  updateTrade: vi.fn(),
}));

vi.mock('@/hooks/useTrades', () => ({
  useCreateTrade: () => ({ isPending: false, mutateAsync: createTrade }),
  useUpdateTrade: () => ({ isPending: false, mutateAsync: updateTrade }),
}));
vi.mock('../AssetSearchDropdown', () => ({
  AssetSearchDropdown: ({
    onSelectAsset,
  }: {
    onSelectAsset: (id: string, asset: Asset) => void;
  }) => (
    <button type="button" onClick={() => onSelectAsset(testAsset.id, testAsset)}>
      Select BTC
    </button>
  ),
}));
vi.mock('../TradeImportTab', () => ({ TradeImportTab: () => null }));

const testAsset: Asset = {
  id: 'asset-btc',
  symbol: 'BTC',
  name: 'Bitcoin',
  category: 'LIQUID_CRYPTO',
  coingeckoId: 'bitcoin',
  priceProvider: 'coingecko',
  providerAssetId: 'bitcoin',
  nativeCurrency: 'USD',
  exchange: null,
  factsheetUrl: null,
  isin: null,
  currentPriceUsd: 100,
  priceUpdatedAt: null,
};

const testTrade: Trade = {
  id: 'trade-btc',
  assetId: testAsset.id,
  asset: testAsset,
  direction: 'LONG',
  entryPrice: 100,
  exitPrice: 110,
  quantity: 2,
  positionSizeUsd: 200,
  entryDate: '2026-10-23T00:00:00.000Z',
  exitDate: '2026-10-28T00:00:00.000Z',
  fundingCost: 5,
  status: 'CLOSED',
  realizedPnL: 15,
  realizedPnLPct: 7.5,
  notes: 'Existing trade notes',
  tags: null,
};

function deferredSave() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function prepareTradeForm(mode: 'create' | 'edit', onSuccess: () => void) {
  render(<TradeForm trade={mode === 'edit' ? testTrade : undefined} onSuccess={onSuccess} />);
  if (mode === 'create') fireEvent.click(screen.getByRole('button', { name: 'Select BTC' }));
  fireEvent.change(screen.getByLabelText('Entry Price'), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText('Exit Price (Optional)'), { target: { value: '110' } });
  fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Funding Cost (Optional)'), { target: { value: '5' } });
  fireEvent.change(screen.getByLabelText('Entry Date'), { target: { value: '2026-10-23' } });
  fireEvent.change(screen.getByLabelText('Exit Date'), { target: { value: '2026-10-28' } });
  fireEvent.change(screen.getByLabelText('Notes (Optional)'), {
    target: { value: 'Keep these notes after failure' },
  });
  const submit = screen.getByRole('button', {
    name: mode === 'edit' ? 'Update Trade' : 'Log Trade',
  });
  return { submit, form: submit.closest('form')! };
}

beforeEach(() => {
  vi.resetAllMocks();
  usePrivacyStore.setState({ valuesHidden: false });
});

describe('TradeForm submission recovery', () => {
  it.each(['create', 'edit'] as const)(
    'dispatches only one %s for same-tick submit events and waits before onSuccess',
    async (mode) => {
      const pending = deferredSave();
      const mutation = mode === 'edit' ? updateTrade : createTrade;
      mutation.mockReturnValue(pending.promise);
      const onSuccess = vi.fn();
      const { form } = prepareTradeForm(mode, onSuccess);

      act(() => {
        fireEvent.submit(form);
        fireEvent.submit(form);
      });

      expect(mutation).toHaveBeenCalledTimes(1);
      expect(mode === 'edit' ? createTrade : updateTrade).not.toHaveBeenCalled();
      const data = {
        assetId: testAsset.id,
        direction: 'LONG',
        entryPrice: 100,
        exitPrice: 110,
        quantity: 2,
        entryDate: '2026-10-23',
        exitDate: '2026-10-28',
        fundingCost: 5,
        notes: 'Keep these notes after failure',
      };
      expect(mutation).toHaveBeenCalledWith(mode === 'edit' ? { id: testTrade.id, data } : data);
      expect(onSuccess).not.toHaveBeenCalled();

      await act(async () => pending.resolve());
      expect(onSuccess).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['create', 'edit'] as const)(
    'handles a rejected %s inline, preserves inputs, and permits one retry',
    async (mode) => {
      const failed = deferredSave();
      const retry = deferredSave();
      const mutation = mode === 'edit' ? updateTrade : createTrade;
      mutation.mockReturnValueOnce(failed.promise).mockReturnValueOnce(retry.promise);
      const onSuccess = vi.fn();
      const { form, submit } = prepareTradeForm(mode, onSuccess);

      fireEvent.submit(form);
      await act(async () => failed.reject(new Error('Trade service is unavailable')));

      expect(screen.getByRole('alert')).toHaveTextContent('Trade service is unavailable');
      expect(screen.getByLabelText('Entry Price')).toHaveValue('100');
      expect(screen.getByLabelText('Exit Price (Optional)')).toHaveValue('110');
      expect(screen.getByLabelText('Quantity')).toHaveValue('2');
      expect(screen.getByLabelText('Funding Cost (Optional)')).toHaveValue('5');
      expect(screen.getByLabelText('Notes (Optional)')).toHaveValue(
        'Keep these notes after failure'
      );
      expect(submit).toBeEnabled();
      expect(onSuccess).not.toHaveBeenCalled();

      act(() => {
        fireEvent.submit(form);
        fireEvent.submit(form);
      });
      expect(mutation).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(onSuccess).not.toHaveBeenCalled();

      await act(async () => retry.resolve());
      expect(onSuccess).toHaveBeenCalledTimes(1);
    }
  );
});

describe('TradeForm P&L preview', () => {
  it('updates with the entered amounts before selecting an asset or saving', () => {
    render(<TradeForm onSuccess={vi.fn()} />);
    const preview = screen.getByRole('status', { name: 'Trade P&L preview' });

    fireEvent.change(screen.getByLabelText('Entry Price'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Exit Price (Optional)'), {
      target: { value: '125' },
    });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '10' } });
    expect(preview).toHaveTextContent('+$250.00');
    expect(preview).toHaveTextContent('+25.00%');

    fireEvent.change(screen.getByLabelText('Funding Cost (Optional)'), {
      target: { value: '20' },
    });
    expect(preview).toHaveTextContent('+$230.00');
    expect(preview).toHaveTextContent('+23.00%');

    fireEvent.change(screen.getByLabelText('Funding Cost (Optional)'), {
      target: { value: '300' },
    });
    expect(preview).toHaveTextContent('Net P&L: -$50.00 -5.00%');

    fireEvent.change(screen.getByLabelText('Funding Cost (Optional)'), {
      target: { value: '' },
    });
    expect(preview).toHaveTextContent('Net P&L: +$250.00 +25.00%');

    fireEvent.change(screen.getByLabelText('Funding Cost (Optional)'), {
      target: { value: '20' },
    });
    fireEvent.change(screen.getByLabelText('Exit Price (Optional)'), { target: { value: '90' } });
    expect(preview).toHaveTextContent('-$120.00');
    expect(preview).toHaveTextContent('-12.00%');

    fireEvent.change(screen.getByLabelText('Exit Price (Optional)'), { target: { value: '' } });
    expect(preview).toHaveTextContent('Net P&L: —');
    expect(preview).not.toHaveTextContent('$');
    expect(createTrade).not.toHaveBeenCalled();
    expect(updateTrade).not.toHaveBeenCalled();
  });

  it('places the preview below Funding Cost and above Notes', () => {
    render(<TradeForm onSuccess={vi.fn()} />);
    const preview = screen.getByRole('status', { name: 'Trade P&L preview' });
    const funding = screen.getByLabelText('Funding Cost (Optional)');
    const notes = screen.getByLabelText('Notes (Optional)');

    expect(
      funding.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(preview.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

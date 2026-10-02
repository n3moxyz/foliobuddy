import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('../AssetSearchDropdown', () => ({ AssetSearchDropdown: () => null }));
vi.mock('../TradeImportTab', () => ({ TradeImportTab: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  usePrivacyStore.setState({ valuesHidden: false });
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

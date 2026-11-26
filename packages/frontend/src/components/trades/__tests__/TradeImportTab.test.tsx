import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';
import { TradeImportTab } from '../TradeImportTab';

const Wrapper = createQueryClientWrapper(createTestQueryClient());

describe('TradeImportTab validation', () => {
  it('shows parse feedback without an alert while typing', () => {
    render(
      <Wrapper>
        <TradeImportTab onSuccess={vi.fn()} />
      </Wrapper>
    );
    const textarea = screen.getByLabelText('Trade JSON to import');
    fireEvent.change(textarea, { target: { value: '{bad' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveAttribute('aria-describedby', 'trade-import-error');
  });

  it('shows an alert and focuses the textarea when importing empty or invalid JSON', () => {
    render(
      <Wrapper>
        <TradeImportTab onSuccess={vi.fn()} />
      </Wrapper>
    );
    const textarea = screen.getByLabelText('Trade JSON to import');
    const button = screen.getByRole('button', { name: /Import/ });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(screen.getByRole('alert')).toHaveTextContent('Paste JSON to import');
    expect(textarea).toHaveFocus();
    fireEvent.change(textarea, { target: { value: '{bad' } });
    fireEvent.click(button);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

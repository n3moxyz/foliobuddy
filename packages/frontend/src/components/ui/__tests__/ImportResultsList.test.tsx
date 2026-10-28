import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImportResultsList } from '../ImportResultsList';

describe('ImportResultsList compatibility', () => {
  it('keeps existing callers close-only when recovery callbacks are absent', () => {
    const onDone = vi.fn();
    render(
      <ImportResultsList
        results={[
          { label: 'BTC', success: true },
          { label: 'BTC', success: false, error: 'Row failed' },
        ]}
        onDone={onDone}
      />
    );

    expect(screen.getByText('1 imported successfully, 1 failed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry failed import' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit failed rows' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Import' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('marks previous results as stale and permits only original-batch recovery when the outcome is unknown', () => {
    const onRetry = vi.fn();
    const onEditFailed = vi.fn();
    render(
      <ImportResultsList
        results={[
          { label: 'BTC', success: true },
          { label: 'BTC', success: false, error: 'Previous failure' },
        ]}
        outcomeKnown={false}
        onRetry={onRetry}
        onEditFailed={onEditFailed}
        onDone={vi.fn()}
      />
    );

    expect(
      screen.getByText('Last confirmed result: 1 imported successfully, 1 failed')
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Some rows may already be saved');
    const edit = screen.getByRole('button', { name: 'Edit failed rows' });
    expect(edit).toBeDisabled();
    fireEvent.click(edit);
    expect(onEditFailed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry original batch' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

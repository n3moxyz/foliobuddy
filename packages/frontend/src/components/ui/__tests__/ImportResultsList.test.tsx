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
});

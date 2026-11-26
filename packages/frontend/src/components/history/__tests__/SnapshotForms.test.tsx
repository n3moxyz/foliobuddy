import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';
import { SnapshotForm } from '../SnapshotForm';
import { SnapshotImportTab } from '../SnapshotImportTab';

const { createSnapshot } = vi.hoisted(() => ({ createSnapshot: vi.fn() }));

vi.mock('@/hooks/useSnapshots', () => ({
  useCreateManualSnapshot: () => ({ isPending: false, mutateAsync: createSnapshot }),
  useUpdateSnapshot: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

describe('SnapshotForm validation on submit', () => {
  it('keeps submit enabled, shows the error, sets aria-invalid and focuses Total Value', () => {
    render(<SnapshotForm fxRate={1.3} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    const submit = screen.getByRole('button', { name: 'Add Snapshot' });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    const input = screen.getByLabelText('Total Value');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'totalValue-error');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a total value');
    expect(input).toHaveFocus();
    expect(createSnapshot).not.toHaveBeenCalled();
  });
});

describe('SnapshotImportTab validation', () => {
  const Wrapper = createQueryClientWrapper(createTestQueryClient());

  it('shows parse feedback without an alert while typing', () => {
    render(
      <Wrapper>
        <SnapshotImportTab onSuccess={vi.fn()} />
      </Wrapper>
    );
    fireEvent.change(screen.getByLabelText('Snapshot JSON to import'), {
      target: { value: '{bad' },
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Snapshot JSON to import')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
  });

  it('shows an alert and focuses the textarea when importing empty or invalid JSON', () => {
    render(
      <Wrapper>
        <SnapshotImportTab onSuccess={vi.fn()} />
      </Wrapper>
    );
    const textarea = screen.getByLabelText('Snapshot JSON to import');
    const button = screen.getByRole('button', { name: /Import/ });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(screen.getByRole('alert')).toHaveTextContent('Paste JSON to import');
    expect(textarea).toHaveFocus();
  });
});

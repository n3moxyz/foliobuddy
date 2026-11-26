import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';
import type { Snapshot } from '@/lib/types';
import { SnapshotForm } from '../SnapshotForm';
import { SnapshotImportTab } from '../SnapshotImportTab';

const { createSnapshot, updateSnapshot } = vi.hoisted(() => ({
  createSnapshot: vi.fn(),
  updateSnapshot: vi.fn(),
}));

vi.mock('@/hooks/useSnapshots', () => ({
  useCreateManualSnapshot: () => ({ isPending: false, mutateAsync: createSnapshot }),
  useUpdateSnapshot: () => ({ isPending: false, mutateAsync: updateSnapshot }),
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

describe('SnapshotForm date validation', () => {
  const snapshot = (source: 'MANUAL' | 'AUTOMATIC') =>
    ({
      id: 'snap-1',
      timestamp: '2026-11-01T05:00:00.000Z',
      totalValueUsd: 1000,
      notes: null,
      source,
    }) as unknown as Snapshot;

  beforeEach(() => vi.clearAllMocks());

  it('reports a cleared date when adding, focuses it and sends nothing', () => {
    render(<SnapshotForm fxRate={1.3} onSuccess={vi.fn()} onCancel={vi.fn()} />);
    const date = screen.getByLabelText('Date');
    fireEvent.change(date, { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Total Value'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Snapshot' }));
    expect(date).toHaveAttribute('aria-invalid', 'true');
    expect(date).toHaveAccessibleDescription('Enter a date');
    expect(date).toHaveFocus();
    expect(createSnapshot).not.toHaveBeenCalled();
  });

  it('reports a cleared date when editing a manual snapshot', () => {
    render(
      <SnapshotForm
        snapshot={snapshot('MANUAL')}
        fxRate={1.3}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const date = screen.getByLabelText('Date');
    fireEvent.change(date, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a date');
    expect(date).toHaveFocus();
    expect(updateSnapshot).not.toHaveBeenCalled();
  });

  it('never asks an automatic snapshot for a date', async () => {
    render(
      <SnapshotForm
        snapshot={snapshot('AUTOMATIC')}
        fxRate={1.3}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(updateSnapshot).toHaveBeenCalledOnce());
    expect(updateSnapshot.mock.calls[0][0].data).not.toHaveProperty('timestamp');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

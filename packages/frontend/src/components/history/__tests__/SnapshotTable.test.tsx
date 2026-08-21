import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Snapshot } from '@/lib/types';
import { SnapshotTable } from '../SnapshotTable';

vi.mock('@/lib/api', () => ({
  api: {
    getSnapshotPositions: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const automaticSnapshot: Snapshot = {
  id: 'snap-1',
  timestamp: '2026-01-15T21:00:00.000Z',
  snapshotType: 'DAILY',
  source: 'AUTOMATIC',
  totalValueUsd: 1_000_000,
  totalValueSgd: 1_300_000,
  usdSgdRate: 1.3,
  totalCostBasis: 900_000,
  monthlyReturn: null,
  ytdReturn: null,
  btcOutperform: null,
  ethOutperform: null,
  notes: null,
};

function renderTable() {
  return render(
    <SnapshotTable
      snapshots={[automaticSnapshot]}
      isLoading={false}
      displayValue={(value) => `$${value}`}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />
  );
}

describe('SnapshotTable expand row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('toasts and keeps the row collapsed when loading positions fails', async () => {
    vi.mocked(api.getSnapshotPositions).mockRejectedValue(new Error('Network down'));
    renderTable();

    const row = screen.getByRole('row', { name: /expand daily snapshot/i });
    fireEvent.click(row);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not load snapshot positions', {
        description: 'Network down',
      })
    );
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/no positions recorded/i)).not.toBeInTheDocument();
  });

  it('expands and shows the empty state when the snapshot has no positions', async () => {
    vi.mocked(api.getSnapshotPositions).mockResolvedValue([]);
    renderTable();

    const row = screen.getByRole('row', { name: /expand daily snapshot/i });
    fireEvent.click(row);

    await waitFor(() => expect(row).toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getByText(/no positions recorded/i)).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

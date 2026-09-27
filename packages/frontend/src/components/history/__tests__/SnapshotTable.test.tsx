import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Snapshot, SnapshotPosition } from '@/lib/types';
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

describe('SnapshotTable copy positions', () => {
  function position(id: string, assetId: string | null, category: string | null): SnapshotPosition {
    return {
      id,
      snapshotId: 'snap-1',
      assetId,
      assetSymbol: 'USDE',
      quantity: 10,
      priceUsd: 1,
      valueUsd: 10,
      allocation: 50,
      asset: { coingeckoId: null, symbol: 'USDE', name: 'USDE', category },
    };
  }

  it('leaves out an unknown class so a pasted import asks instead of guessing', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    vi.mocked(api.getSnapshotPositions).mockResolvedValue([
      position('sp-1', 'stablecoinx-row', 'EQUITY'),
      position('sp-2', null, null),
    ]);
    renderTable();

    fireEvent.click(screen.getByRole('row', { name: /expand daily snapshot/i }));
    fireEvent.click(await screen.findByRole('button', { name: /copy positions/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const [known, unknown] = JSON.parse(writeText.mock.calls[0][0]);
    expect(known.asset.category).toBe('EQUITY');
    expect(unknown.asset).not.toHaveProperty('category');
  });
});

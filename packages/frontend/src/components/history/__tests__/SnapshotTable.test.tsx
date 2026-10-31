import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Snapshot, SnapshotPosition } from '@/lib/types';
import { SnapshotTable } from '../SnapshotTable';
import { DEFAULT_SNAPSHOT_SCHEDULE, type SnapshotSchedule } from '../snapshotTiming';
import { MASKED_MONEY_VALUE, usePrivacyStore } from '@/stores/privacyStore';

afterEach(() => act(() => usePrivacyStore.getState().setValuesHidden(false)));

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
      snapshotSchedule={DEFAULT_SNAPSHOT_SCHEDULE}
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

    const row = screen.getByRole('button', { name: /expand daily snapshot/i }).closest('tr')!;
    fireEvent.click(row);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not load snapshot positions', {
        description: 'Network down',
      })
    );
    expect(within(row).getByRole('button', { name: /expand daily snapshot/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByText(/no positions recorded/i)).not.toBeInTheDocument();
  });

  it('expands and shows the empty state when the snapshot has no positions', async () => {
    vi.mocked(api.getSnapshotPositions).mockResolvedValue([]);
    renderTable();

    const row = screen.getByRole('button', { name: /expand daily snapshot/i }).closest('tr')!;
    fireEvent.click(row);

    await waitFor(() =>
      expect(within(row).getByRole('button', { name: /collapse daily snapshot/i })).toHaveAttribute(
        'aria-expanded',
        'true'
      )
    );
    expect(row).not.toHaveAttribute('aria-expanded');
    expect(screen.getByText(/no positions recorded/i)).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('masks snapshot holdings and values while keeping public prices visible', async () => {
    vi.mocked(api.getSnapshotPositions).mockResolvedValue([
      {
        id: 'private-holding',
        snapshotId: automaticSnapshot.id,
        assetSymbol: 'PRIVATE',
        quantity: 54321.25,
        priceUsd: 12.34,
        valueUsd: 670324.225,
        allocation: 67.03,
      } as SnapshotPosition,
    ]);
    act(() => usePrivacyStore.getState().setValuesHidden(true));
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: /expand daily snapshot/i }).closest('tr')!);
    const row = (await screen.findByText('PRIVATE')).closest('tr')!;
    const cells = within(row).getAllByRole('cell');
    expect(cells[1]).toHaveTextContent(MASKED_MONEY_VALUE);
    expect(cells[2]).toHaveTextContent('$12.34');
    expect(cells[3]).toHaveTextContent(MASKED_MONEY_VALUE);
    expect(cells[4]).toHaveTextContent('67.03%');
    act(() => usePrivacyStore.getState().toggleValuesHidden());
    expect(cells[1]).toHaveTextContent('54,321.25');
    expect(cells[3]).toHaveTextContent('$670,324');
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

    fireEvent.click(screen.getByRole('button', { name: /expand daily snapshot/i }).closest('tr')!);
    fireEvent.click(await screen.findByRole('button', { name: /copy positions/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const [known, unknown] = JSON.parse(writeText.mock.calls[0][0]);
    expect(known.asset.category).toBe('EQUITY');
    expect(unknown.asset).not.toHaveProperty('category');
  });
});

describe('SnapshotTable live row', () => {
  // 11:30Z is 07:30 in New York (before 8am) but 19:30 in Singapore (after 5am).
  const NEW_YORK_8AM: SnapshotSchedule = { hour: 8, timeZone: 'America/New_York' };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-15T11:30:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  function renderLiveTable(snapshotSchedule: SnapshotSchedule, snapshots: Snapshot[] = []) {
    return render(
      <SnapshotTable
        snapshots={snapshots}
        isLoading={false}
        displayValue={(value) => `$${value}`}
        liveValueUsd={1234}
        snapshotSchedule={snapshotSchedule}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
  }

  it("shows the pending row until the person's own snapshot time", () => {
    // 02:00Z is 22:00 yesterday in New York, but already today in Singapore.
    const lastNight = { ...automaticSnapshot, timestamp: '2026-07-15T02:00:00.000Z' };
    renderLiveTable(NEW_YORK_8AM, [lastNight]);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('hides the pending row on the default schedule once 5am Singapore has passed', () => {
    renderLiveTable(DEFAULT_SNAPSHOT_SCHEDULE);
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
  });

  it("hides the pending row once a snapshot exists for today in the person's timezone", () => {
    // 10:00Z is 06:00 today in New York.
    const earlierToday = { ...automaticSnapshot, timestamp: '2026-07-15T10:00:00.000Z' };
    renderLiveTable(NEW_YORK_8AM, [earlierToday]);
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
  });
});

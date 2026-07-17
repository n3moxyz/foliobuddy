import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PerformersCard } from '../PerformersCard';
import type { Performer } from '@/lib/types';
import { usePrivacyStore } from '@/stores/privacyStore';

describe('PerformersCard', () => {
  it('renders multiple positions for the same asset without duplicate React keys', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const performers = [
      {
        assetId: 'cash-sgd',
        symbol: 'SGD',
        name: 'Cash SGD - DBS',
        unrealizedPnL: 120,
        unrealizedPnLPct: 0.4,
        marketValueUsd: 12000,
      },
      {
        assetId: 'cash-sgd',
        symbol: 'SGD',
        name: 'Cash SGD - UOB',
        unrealizedPnL: -80,
        unrealizedPnLPct: -0.3,
        marketValueUsd: 8000,
      },
    ] satisfies Performer[];

    render(<PerformersCard title="Top Performers" performers={performers} type="top" />);

    expect(screen.getByText('Cash SGD - DBS')).toBeInTheDocument();
    expect(screen.getByText('Cash SGD - UOB')).toBeInTheDocument();
    expect(
      consoleError.mock.calls.some((call) =>
        call.some((part) => String(part).includes('Encountered two children with the same key'))
      )
    ).toBe(false);

    consoleError.mockRestore();
  });

  it('masks monetary P&L while preserving percentages', () => {
    act(() => usePrivacyStore.getState().setValuesHidden(true));
    const performers = [
      {
        assetId: 'btc',
        symbol: 'BTC',
        name: 'Bitcoin',
        unrealizedPnL: 1234,
        unrealizedPnLPct: 12.5,
        marketValueUsd: 12000,
      },
    ] satisfies Performer[];

    render(<PerformersCard title="Top Performers" performers={performers} type="top" />);

    expect(screen.getByText('••••')).toBeInTheDocument();
    expect(screen.queryByText('$1,234')).not.toBeInTheDocument();
    expect(screen.getByText('+12.50%')).toBeInTheDocument();

    act(() => usePrivacyStore.getState().setValuesHidden(false));
  });
});

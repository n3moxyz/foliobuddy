import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PerformersCard } from '../PerformersCard';
import type { Performer } from '@/lib/types';

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
});

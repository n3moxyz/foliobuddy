import type { ComponentType } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';
import Dashboard from '../Dashboard';
import History from '../History';
import Investors from '../Investors';
import Portfolio from '../Portfolio';
import Trades from '../Trades';

afterEach(() => vi.restoreAllMocks());

describe('failed first loads', () => {
  it.each<
    [
      ComponentType,
      'getPositionSummary' | 'getPositions' | 'getTrades' | 'getSnapshots' | 'getInvestors',
      string,
      string,
    ]
  >([
    [Dashboard, 'getPositionSummary', 'your dashboard', 'Net Worth'],
    [Portfolio, 'getPositions', 'positions', 'No positions yet'],
    [Trades, 'getTrades', 'trades', 'No trades logged'],
    [History, 'getSnapshots', 'snapshots', 'No snapshots yet'],
    [Investors, 'getInvestors', 'investors', 'No investors yet'],
  ])('offers recovery for %s', async (Page, method, subject, emptyText) => {
    // Isolate all network requests. Only the named query fails.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    const request = vi.spyOn(api, method).mockRejectedValue(new Error('Network unavailable'));
    const client = createTestQueryClient();
    const Wrapper = createQueryClientWrapper(client);
    render(
      <Wrapper>
        <TooltipProvider>
          <MemoryRouter>
            <Page />
          </MemoryRouter>
        </TooltipProvider>
      </Wrapper>
    );
    expect(await screen.findByText(`Couldn't load ${subject}`)).toBeVisible();
    expect(screen.queryByText(emptyText)).not.toBeInTheDocument();
    const calls = request.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(request.mock.calls.length).toBeGreaterThan(calls));
    client.clear();
  });
});

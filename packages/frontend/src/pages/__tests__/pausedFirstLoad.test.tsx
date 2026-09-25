import type { ComponentType } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';
import Dashboard from '../Dashboard';
import History from '../History';
import Investors from '../Investors';
import Portfolio from '../Portfolio';
import Trades from '../Trades';

// React Query pauses a first load while offline or in a hidden tab: the query is
// pending but not fetching, so an isLoading-only gate rendered a blank page or a
// confident "No … yet" empty state. News covers the same case with mocked flags.
describe('pages while the first load is paused (offline or hidden tab)', () => {
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it.each<[string, ComponentType, string, string | null]>([
    ['Dashboard', Dashboard, 'Loading dashboard…', null],
    ['Portfolio', Portfolio, 'Loading positions…', 'No positions yet'],
    ['Trades', Trades, 'Loading trades…', 'No trades logged'],
    ['History', History, 'Loading snapshots…', 'No snapshots yet'],
    ['Investors', Investors, 'Loading investors…', 'No investors yet'],
  ])('%s shows its loading state, not an empty one', (_page, Page, loadingText, emptyText) => {
    // Real React Query pause, not mocked flags.
    onlineManager.setOnline(false);
    const queryClient = createTestQueryClient();
    const Wrapper = createQueryClientWrapper(queryClient);

    render(
      <Wrapper>
        {/* Same providers as main.tsx, so a regression fails on the assertion, not a crash. */}
        <TooltipProvider>
          <MemoryRouter>
            <Page />
          </MemoryRouter>
        </TooltipProvider>
      </Wrapper>
    );

    const queries = queryClient.getQueryCache().getAll();
    expect(queries.some((query) => query.state.fetchStatus === 'paused')).toBe(true);
    expect(screen.getAllByText(loadingText)[0].closest('[role="status"]')).not.toBeNull();
    if (emptyText) expect(screen.queryByText(emptyText)).not.toBeInTheDocument();
  });
});

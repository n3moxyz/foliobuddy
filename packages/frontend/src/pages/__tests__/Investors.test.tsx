import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import type { Investor } from '@/lib/types';
import { TooltipProvider } from '@/components/ui/tooltip';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';
import Investors from '../Investors';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('explains full allocation before submission and lets the user return to rebalance', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  const owner = {
    id: 'owner',
    name: 'Owner',
    stakePercentage: 100,
    isOwner: true,
    currentValue: 1000,
    capitalAtYearStart: 900,
    ytdReturn: 100,
    ytdReturnPct: 11.11,
  } as Investor;
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
  vi.spyOn(api, 'getInvestors').mockResolvedValue([owner]);
  const create = vi.spyOn(api, 'createInvestor');
  const client = createTestQueryClient();
  const Wrapper = createQueryClientWrapper(client);
  render(
    <Wrapper>
      <TooltipProvider>
        <MemoryRouter>
          <Investors />
        </MemoryRouter>
      </TooltipProvider>
    </Wrapper>
  );
  await screen.findAllByText('Owner');
  const opener = screen.getByRole('button', { name: 'Add Investor' });
  opener.focus();
  fireEvent.click(opener);
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'New investor' } });
  expect(within(dialog).getByRole('button', { name: 'Add Investor' })).toBeDisabled();
  expect(within(dialog).getByRole('status')).toHaveTextContent(
    'No stake is available. Reduce an existing investor’s stake'
  );
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(opener).toHaveFocus());
  client.clear();
});

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
  const submit = within(dialog).getByRole('button', { name: 'Add Investor' });
  expect(submit).toBeEnabled();
  expect(within(dialog).getByRole('status')).toHaveTextContent(
    "No stake is available. Reduce an existing investor's stake"
  );
  fireEvent.click(submit);
  expect(within(dialog).getByRole('alert')).toHaveTextContent(
    "No stake is available. Reduce an existing investor's stake"
  );
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(opener).toHaveFocus());
  client.clear();
});

it('names the investor in the delete description and ends with the undo warning', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  const investors = [
    {
      id: 'owner',
      name: 'Owner',
      stakePercentage: 60,
      isOwner: true,
      currentValue: 600,
      capitalAtYearStart: 500,
      ytdReturn: 100,
      ytdReturnPct: 20,
    },
    {
      id: 'alice',
      name: 'Alice',
      stakePercentage: 40,
      isOwner: false,
      currentValue: 400,
      capitalAtYearStart: 350,
      ytdReturn: 50,
      ytdReturnPct: 14.29,
    },
  ] as Investor[];
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
  vi.spyOn(api, 'getInvestors').mockResolvedValue(investors);
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
  await screen.findAllByText('Alice');
  fireEvent.click(screen.getAllByRole('button', { name: 'Delete investor Alice' })[0]);

  expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
    'Are you sure you want to delete Alice from the investor list? Historical data will not be affected. This action cannot be undone.'
  );
  client.clear();
});

it('shows an inline name error with aria wiring and focus when submitting an empty name', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
  vi.spyOn(api, 'getInvestors').mockResolvedValue([
    { id: 'owner', name: 'Owner', stakePercentage: 50, isOwner: true } as Investor,
  ]);
  const create = vi.spyOn(api, 'createInvestor');
  const Wrapper = createQueryClientWrapper(createTestQueryClient());
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
  fireEvent.click(screen.getByRole('button', { name: 'Add Investor' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add Investor' }));
  const name = within(dialog).getByLabelText('Name');
  expect(name).toHaveAttribute('aria-invalid', 'true');
  expect(name).toHaveAttribute('aria-describedby', 'investor-name-error');
  expect(name).toHaveAccessibleDescription('Enter a name');
  expect(name).toHaveFocus();
  expect(create).not.toHaveBeenCalled();
});

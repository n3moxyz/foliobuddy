import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { installAuthSession } from '@/lib/authSession';
import type { PortfolioGroupOrders } from '@/lib/portfolioGroupOrders';
import { usePortfolioGroupOrders } from '../usePortfolioGroupOrders';

const mocks = vi.hoisted(() => ({
  getPortfolioGroupOrders: vi.fn(),
  savePortfolioGroupOrder: vi.fn(),
  importPortfolioGroupOrders: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ apiForSession: () => mocks }));

beforeEach(() => {
  vi.resetAllMocks();
  installAuthSession('group-order-user', 'group-order-session', async () => null, 'local');
});

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(usePortfolioGroupOrders, { wrapper });
}

it('uses account orders, imports only missing legacy scopes, and ignores another user’s browser order', async () => {
  localStorage.setItem(
    'foliobuddy-position-group-order:group-order-user:cash',
    JSON.stringify({ storage: ['cex', 'bank'] })
  );
  localStorage.setItem(
    'foliobuddy-position-group-order:group-order-user:equities',
    JSON.stringify({ broker: ['ibkr', 'tiger'] })
  );
  localStorage.setItem(
    'foliobuddy-position-group-order:other-user:crypto',
    JSON.stringify({ storage: ['onchain', 'cex'] })
  );
  let remote: PortfolioGroupOrders = { 'cash:storage': ['bank', 'cex'] };
  mocks.getPortfolioGroupOrders.mockImplementation(async () => remote);
  mocks.importPortfolioGroupOrders.mockImplementation(async () => {
    remote = { ...remote, 'equities:broker': ['ibkr', 'tiger'] };
  });

  const { result } = show();
  await waitFor(() =>
    expect(mocks.importPortfolioGroupOrders).toHaveBeenCalledWith([
      { scope: 'equities:broker', order: ['ibkr', 'tiger'] },
    ])
  );
  await waitFor(() => expect(mocks.getPortfolioGroupOrders).toHaveBeenCalledTimes(2));
  expect(result.current.preference('cash:storage').order).toEqual(['bank', 'cex']);
  expect(result.current.preference('crypto:storage').order).toBeUndefined();
});

it('saves one scope and keeps the slot for a temporarily empty group', async () => {
  let remote: PortfolioGroupOrders = {
    'cash:storage': ['cex', 'bank', 'brokerage'],
    'equities:broker': ['tiger', 'ibkr'],
  };
  mocks.getPortfolioGroupOrders.mockImplementation(async () => remote);
  mocks.savePortfolioGroupOrder.mockImplementation(async ({ scope, order }) => {
    remote = { ...remote, [scope]: order };
    return { order };
  });

  const { result } = show();
  await waitFor(() => expect(result.current.preference('cash:storage').ready).toBe(true));
  await act(() => result.current.preference('cash:storage').save(['brokerage', 'cex']));
  expect(mocks.savePortfolioGroupOrder).toHaveBeenCalledWith({
    scope: 'cash:storage',
    order: ['brokerage', 'bank', 'cex'],
  });
  await waitFor(() =>
    expect(result.current.preference('cash:storage').order).toEqual(['brokerage', 'bank', 'cex'])
  );
  expect(result.current.preference('equities:broker').order).toEqual(['tiger', 'ibkr']);
});

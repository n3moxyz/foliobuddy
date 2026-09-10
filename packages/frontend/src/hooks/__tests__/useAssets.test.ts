import { act, renderHook } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { api } from '@/lib/api';
import { useRefreshAssetPrice } from '@/hooks/useAssets';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';

vi.mock('@/lib/api', () => ({ api: { refreshAssetPrice: vi.fn() } }));

it('invalidates cached NAV metadata and valuations even when an explicit check fails', async () => {
  const client = createTestQueryClient();
  for (const key of ['assets', 'positions', 'portfolio'])
    client.setQueryData([key], { priceCheckStatus: 'ok' });
  vi.mocked(api.refreshAssetPrice).mockRejectedValue(new Error('NAV source unavailable'));
  const { result } = renderHook(() => useRefreshAssetPrice(), {
    wrapper: createQueryClientWrapper(client),
  });
  await act(async () => {
    await expect(result.current.mutateAsync('amova')).rejects.toThrow('unavailable');
  });
  for (const key of ['assets', 'positions', 'portfolio'])
    expect(client.getQueryState([key])?.isInvalidated).toBe(true);
});

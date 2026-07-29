import { beforeEach, describe, expect, it } from 'vitest';
import { handleDemoApi, resetDemoDataForTests } from '../demoMode';

function apiUrl(path: string) {
  return new URL(`http://localhost:4000/api/v1${path}`);
}

async function demoRequest(path: string, method = 'GET', body?: unknown) {
  const response = await handleDemoApi(apiUrl(path), method, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(response).not.toBeNull();
  return response as Response;
}

async function readJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

describe('demo mode API mock', () => {
  beforeEach(() => {
    resetDemoDataForTests();
  });

  it('bulk-imports trades and recomputes analytics from demo state', async () => {
    const beforeTrades = await readJson<Array<{ id: string }>>(await demoRequest('/trades'));
    const beforeAnalytics = await readJson<{ totalTrades: number; totalPnL: number }>(
      await demoRequest('/trades/analytics')
    );

    const importResponse = await readJson<{
      results: Array<{ success: boolean; symbol: string }>;
    }>(
      await demoRequest('/trades/bulk-import', 'POST', [
        {
          asset: {
            coingeckoId: 'qa-token',
            symbol: 'QA1',
            name: 'QA Token One',
            category: 'LIQUID_CRYPTO',
          },
          direction: 'LONG',
          entryPrice: 10,
          exitPrice: 15,
          quantity: 100,
          fundingCost: 25,
          entryDate: '2026-04-01',
          exitDate: '2026-04-05',
          notes: 'Synthetic QA import',
          tags: ['qa', 'import'],
        },
      ])
    );

    expect(importResponse.results).toEqual([{ success: true, symbol: 'QA1' }]);

    const afterTrades = await readJson<
      Array<{ asset: { symbol: string }; fundingCost: number; realizedPnL: number }>
    >(await demoRequest('/trades'));
    const afterAnalytics = await readJson<{
      totalTrades: number;
      totalPnL: number;
    }>(await demoRequest('/trades/analytics'));

    expect(afterTrades).toHaveLength(beforeTrades.length + 1);
    expect(afterTrades[0].asset.symbol).toBe('QA1');
    expect(afterTrades[0].fundingCost).toBe(25);
    expect(afterTrades[0].realizedPnL).toBe(475);
    expect(afterAnalytics.totalTrades).toBe(beforeAnalytics.totalTrades + 1);
    expect(afterAnalytics.totalPnL).toBe(beforeAnalytics.totalPnL + 475);
  });

  it('bulk-imports snapshots and exposes them in performance history', async () => {
    const importResponse = await readJson<{
      successCount: number;
      totalCount: number;
      results: Array<{ success: boolean; timestamp: string }>;
    }>(
      await demoRequest('/snapshots/bulk', 'POST', {
        snapshots: [
          {
            timestamp: '2026-04-15T13:00:00.000Z',
            snapshotType: 'DAILY',
            totalValueUsd: 333333,
            totalCostBasis: 222222,
            notes: 'Synthetic QA snapshot',
          },
        ],
      })
    );

    expect(importResponse.successCount).toBe(1);
    expect(importResponse.totalCount).toBe(1);
    expect(importResponse.results[0].success).toBe(true);

    const snapshots = await readJson<Array<{ timestamp: string; totalValueUsd: number }>>(
      await demoRequest('/snapshots')
    );
    const performance = await readJson<Array<{ timestamp: string; totalValueUsd: number }>>(
      await demoRequest('/snapshots/performance?all=true')
    );

    expect(snapshots.some((snapshot) => snapshot.totalValueUsd === 333333)).toBe(true);
    expect(performance.some((point) => point.totalValueUsd === 333333)).toBe(true);
  });

  it('creates, updates, and deletes demo investors with stake reassignment', async () => {
    const created = await readJson<{ id: string; name: string; stakePercentage: number }>(
      await demoRequest('/investors', 'POST', {
        name: 'QA Investor',
        initialCapital: 12345,
      })
    );

    expect(created.name).toBe('QA Investor');
    expect(created.stakePercentage).toBe(0);

    const updated = await readJson<{ id: string; name: string; stakePercentage: number }>(
      await demoRequest(`/investors/${created.id}`, 'PUT', {
        name: 'QA Investor Updated',
        stakePercentage: 5,
      })
    );

    expect(updated.name).toBe('QA Investor Updated');
    expect(updated.stakePercentage).toBe(5);

    const investorsBeforeDelete = await readJson<Array<{ id: string; stakePercentage: number }>>(
      await demoRequest('/investors')
    );
    const target = investorsBeforeDelete.find((investor) => investor.id !== created.id);
    expect(target).toBeDefined();

    const deleteResponse = await demoRequest(
      `/investors/${created.id}?reassignTo=${target!.id}`,
      'DELETE'
    );
    expect(deleteResponse.status).toBe(204);

    const investorsAfterDelete = await readJson<Array<{ id: string; stakePercentage: number }>>(
      await demoRequest('/investors')
    );

    expect(investorsAfterDelete.some((investor) => investor.id === created.id)).toBe(false);
    expect(
      investorsAfterDelete.find((investor) => investor.id === target!.id)?.stakePercentage
    ).toBe(target!.stakePercentage + 5);
  });

  it('updates manual asset NAV and recomputes linked demo positions', async () => {
    const positionsBefore = await readJson<
      Array<{ assetId: string; asset: { category: string }; marketValueUsd: number }>
    >(await demoRequest('/positions'));
    const unitTrustPosition = positionsBefore.find(
      (position) => position.asset.category === 'UNIT_TRUST'
    );
    expect(unitTrustPosition).toBeDefined();

    const updatedAsset = await readJson<{ id: string; currentPriceUsd: number }>(
      await demoRequest(`/assets/${unitTrustPosition!.assetId}/nav`, 'PATCH', {
        navPrice: 2,
        asOfDate: '2026-06-10',
      })
    );
    expect(updatedAsset.currentPriceUsd).toBeGreaterThan(0);

    const positionsAfter = await readJson<Array<{ assetId: string; marketValueUsd: number }>>(
      await demoRequest('/positions')
    );
    const updatedPosition = positionsAfter.find(
      (position) => position.assetId === unitTrustPosition!.assetId
    );

    expect(updatedPosition?.marketValueUsd).not.toBe(unitTrustPosition!.marketValueUsd);
  });
});

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

  it('round-trips server-backed perp exposure and resets its nullable migration state', async () => {
    const initialPreferences = await readJson<{ perpExposureUsd: number | null }>(
      await demoRequest('/users/me/preferences')
    );
    expect(initialPreferences.perpExposureUsd).toBeNull();

    await demoRequest('/users/me/preferences', 'PATCH', { perpExposureUsd: 350_000 });

    const savedPreferences = await readJson<{ perpExposureUsd: number | null }>(
      await demoRequest('/users/me/preferences')
    );
    expect(savedPreferences.perpExposureUsd).toBe(350_000);

    resetDemoDataForTests();

    const resetPreferences = await readJson<{ perpExposureUsd: number | null }>(
      await demoRequest('/users/me/preferences')
    );
    expect(resetPreferences.perpExposureUsd).toBeNull();
  });

  it('serves the deterministic news feed grouped by portfolio buckets', async () => {
    const news = await readJson<{
      crypto: Array<{ symbol: string; openTradeOnly: boolean; items: Array<{ id: string }> }>;
      equities: Array<{ symbol: string; items: Array<{ id: string }> }>;
      macro: Array<{ id: string; publishedAt: string | null }>;
      fetchedAt: string;
    }>(await demoRequest('/news'));

    expect(news.crypto.map((group) => group.symbol)).toEqual(['BTC', 'ETH', 'SOL', 'XRP']);
    expect(news.crypto.find((group) => group.symbol === 'XRP')?.openTradeOnly).toBe(true);
    expect(news.equities.map((group) => group.symbol)).toEqual(['VOO', 'D05.SI']);
    expect(news.macro.length).toBeGreaterThan(0);
    expect(news.macro.every((item) => item.publishedAt !== null)).toBe(true);
    expect(news.fetchedAt).toBe('2026-06-02T12:00:00.000Z');
  });

  it('accepts news feedback with a bodyless 204', async () => {
    const response = await demoRequest('/news/feedback', 'POST', {
      storyId: 'btc-1',
      title: 'Bitcoin ETF inflows hit three-week high as funds add $480M',
      reason: 'not_relevant',
    });

    expect(response.status).toBe(204);
  });

  it('serves deterministic AI enrichments for a subset of demo top stories', async () => {
    const enrichment = await readJson<{
      enabled: boolean;
      enrichments: Record<string, { provenance: string; confidence: string }>;
    }>(await demoRequest('/news/enrichment'));

    expect(enrichment.enabled).toBe(true);
    expect(Object.keys(enrichment.enrichments).sort()).toEqual(['btc-1', 'macro-1']);
    expect(Object.values(enrichment.enrichments).every((e) => e.provenance === 'article')).toBe(
      true
    );
  });

  it('exposes ranking metadata and material top stories in the demo news feed', async () => {
    const news = await readJson<{
      topStories: Array<{ id: string; importance: string; sourceTier: number }>;
      crypto: Array<{ items: Array<{ importance: string; affectedSymbols: string[] }> }>;
    }>(await demoRequest('/news'));

    expect(news.topStories.map((item) => item.id)).toEqual(['macro-1', 'btc-1', 'dbs-1']);
    expect(news.topStories.every((item) => item.importance === 'high')).toBe(true);
    expect(news.topStories.every((item) => item.sourceTier <= 3)).toBe(true);
    expect(
      news.crypto.every((group) =>
        group.items.every((item) => item.affectedSymbols.length > 0 && item.importance)
      )
    ).toBe(true);
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

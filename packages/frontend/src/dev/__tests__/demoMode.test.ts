import { beforeEach, describe, expect, it } from 'vitest';
import {
  STABLECOIN_CATEGORIES,
  type Asset,
  type Position,
  type PositionHistoryEntry,
  type ProviderSearchResult,
  type Trade,
} from '@foliobuddy/shared';
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

async function seedPositions() {
  return readJson<Position[]>(await demoRequest('/positions'));
}

async function findSeedPositions() {
  const positions = await seedPositions();
  const target = positions.find(
    (position) => !position.custodyOf && !STABLECOIN_CATEGORIES.includes(position.asset.category)
  );
  const cashPile = positions.find(
    (position) => !position.custodyOf && STABLECOIN_CATEGORIES.includes(position.asset.category)
  );
  if (!target || !cashPile) {
    throw new Error('Expected demo seed data to include a non-cash and a cash owned position');
  }
  return { target, cashPile };
}

async function positionHistoryFor(positionId: string) {
  return readJson<PositionHistoryEntry[]>(await demoRequest(`/positions/${positionId}/history`));
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

  it('lists every news holding with story counts, including quiet and not-loaded ones', async () => {
    type DemoGroup = { assetId: string; items: unknown[]; storyCount?: number };
    const news = await readJson<{
      crypto: DemoGroup[];
      equities: DemoGroup[];
      holdings: Array<{ assetId: string; storyCount: number; loaded: boolean }>;
    }>(await demoRequest('/news'));

    const groups = [...news.crypto, ...news.equities];
    const holdingIds = news.holdings.map((holding) => holding.assetId);
    expect(groups.every((group) => holdingIds.includes(group.assetId))).toBe(true);
    expect(groups.every((group) => (group.storyCount ?? 0) >= group.items.length)).toBe(true);
    expect(groups.some((group) => (group.storyCount ?? 0) > 1)).toBe(true);
    expect(news.holdings.some((holding) => holding.loaded && holding.storyCount === 0)).toBe(true);
    expect(news.holdings.some((holding) => !holding.loaded)).toBe(true);
  });

  it('serves a holding dossier newest first and 404s unknown holdings', async () => {
    type DemoDossier = {
      holding: { assetId: string; symbol: string };
      items: Array<{ id: string; publishedAt: string | null }>;
      windowDays: number;
    };
    const btc = await readJson<DemoDossier>(await demoRequest('/news/asset/btc'));

    expect(btc.holding).toMatchObject({ assetId: 'btc', symbol: 'BTC' });
    expect(btc.windowDays).toBe(60);
    // The feed group's stories plus older coverage, newest first.
    expect(btc.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(['btc-1', 'btc-2', 'btc-3'])
    );
    expect(btc.items.length).toBeGreaterThan(3);
    const times = btc.items.map((item) => new Date(item.publishedAt ?? 0).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));

    // A story filed under a bigger holding still belongs to every holding it touches.
    const eth = await readJson<DemoDossier>(await demoRequest('/news/asset/eth'));
    expect(eth.items.some((item) => item.id === 'btc-3')).toBe(true);

    // A holding past the feed's fetch cap still loads its own news.
    const aapl = await readJson<DemoDossier>(await demoRequest('/news/asset/aapl'));
    expect(aapl.items.length).toBeGreaterThan(0);

    const missing = await demoRequest('/news/asset/not-a-holding');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'No news feed for this holding' });
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
        asOfDate: new Date().toISOString(),
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

  it('retains automatic NAV ownership and date across statement re-import and same-day checks', async () => {
    const input = {
      symbol: 'AMOVASIN',
      name: 'Amova Singapore Equity SGD',
      isin: 'SG9999004360',
      nativeCurrency: 'SGD',
      initialNav: 5.3036,
      navAsOfDate: '2026-04-30T00:00:00Z',
    };
    const asset = await readJson<Position['asset']>(
      await demoRequest('/assets/unit-trust', 'POST', input)
    );
    expect(asset.currentPriceNative).toBe(6.0462);
    expect(asset.priceProvider).toBe('fund-manager');
    const imported = await readJson<Position['asset']>(
      await demoRequest(`/assets/${asset.id}/nav`, 'PATCH', {
        navPrice: 4,
        asOfDate: input.navAsOfDate,
      })
    );
    expect(imported.currentPriceNative).toBe(asset.currentPriceNative);
    const reimport = await readJson<Position['asset']>(
      await demoRequest('/assets/unit-trust', 'POST', input)
    );
    expect(reimport.priceProvider).toBe('fund-manager');
    const refreshed = await readJson<Position['asset']>(
      await demoRequest(`/assets/${asset.id}/refresh-price`, 'POST')
    );
    expect(refreshed.priceAsOf).toBe(asset.priceAsOf);
    expect(refreshed.currentPriceNative).toBe(asset.currentPriceNative);
    expect(refreshed.priceCheckedAt).toBeTruthy();
  });

  it('reduces a position with proceeds into a linked cash pile, then restores both sides on cancel', async () => {
    const { target, cashPile } = await findSeedPositions();
    const reduceQuantity = 0.5;
    const proceedsUsd = 40000;
    const nextQuantity = target.quantity - reduceQuantity;
    const cashPriceUsd = cashPile.asset.currentPriceUsd ?? cashPile.avgCostUsd;
    const expectedCashQuantity = cashPile.quantity + proceedsUsd / cashPriceUsd;

    const updatedTarget = await readJson<Position>(
      await demoRequest(`/positions/${target.id}`, 'PUT', {
        quantity: nextQuantity,
        avgCostUsd: target.avgCostUsd,
        fundingCashPositionId: cashPile.id,
        positionDelta: { mode: 'reduce', quantity: reduceQuantity, proceedsUsd },
      })
    );

    expect(updatedTarget.quantity).toBe(nextQuantity);
    expect(updatedTarget.avgCostUsd).toBe(target.avgCostUsd);

    const positionsAfterReduce = await seedPositions();
    const cashAfterReduce = positionsAfterReduce.find((position) => position.id === cashPile.id);
    expect(cashAfterReduce?.quantity).toBe(expectedCashQuantity);

    const targetHistoryAfterReduce = await positionHistoryFor(target.id);
    const cashHistoryAfterReduce = await positionHistoryFor(cashPile.id);
    const reduceEntry = targetHistoryAfterReduce[0];
    const cashEntry = cashHistoryAfterReduce[0];

    expect(reduceEntry.mode).toBe('reduce');
    expect(reduceEntry.quantity).toBe(reduceQuantity);
    expect(reduceEntry.proceedsUsd).toBe(proceedsUsd);
    expect(cashEntry.mode).toBe('add');
    expect(cashEntry.costBasisUsd).toBe(proceedsUsd);
    expect(reduceEntry.operationId).toBeTruthy();
    expect(cashEntry.operationId).toBe(reduceEntry.operationId);

    const restoredTarget = await readJson<Position>(
      await demoRequest(`/positions/${target.id}/history/${reduceEntry.id}`, 'DELETE')
    );

    expect(restoredTarget.quantity).toBe(target.quantity);
    expect(restoredTarget.avgCostUsd).toBe(target.avgCostUsd);

    const positionsAfterCancel = await seedPositions();
    const targetAfterCancel = positionsAfterCancel.find((position) => position.id === target.id);
    const cashAfterCancel = positionsAfterCancel.find((position) => position.id === cashPile.id);
    expect(targetAfterCancel?.quantity).toBe(target.quantity);
    expect(targetAfterCancel?.avgCostUsd).toBe(target.avgCostUsd);
    expect(cashAfterCancel?.quantity).toBe(cashPile.quantity);
    expect(cashAfterCancel?.avgCostUsd).toBe(cashPile.avgCostUsd);

    const targetHistoryAfterCancel = await positionHistoryFor(target.id);
    const cashHistoryAfterCancel = await positionHistoryFor(cashPile.id);
    expect(targetHistoryAfterCancel.some((entry) => entry.id === reduceEntry.id)).toBe(false);
    expect(cashHistoryAfterCancel.some((entry) => entry.id === cashEntry.id)).toBe(false);
    expect(targetHistoryAfterCancel).toHaveLength(targetHistoryAfterReduce.length - 1);
    expect(cashHistoryAfterCancel).toHaveLength(cashHistoryAfterReduce.length - 1);
  });

  it('removes a position (and its history) when a reduce lands on zero, keeping the cash deposit', async () => {
    const { target, cashPile } = await findSeedPositions();
    const proceedsUsd = 12_345;
    const cashPriceUsd = cashPile.asset.currentPriceUsd ?? cashPile.avgCostUsd;

    const closed = await readJson<Position>(
      await demoRequest(`/positions/${target.id}`, 'PUT', {
        quantity: 0,
        avgCostUsd: 0,
        fundingCashPositionId: cashPile.id,
        positionDelta: { mode: 'reduce', quantity: target.quantity, proceedsUsd },
      })
    );
    expect(closed.quantity).toBe(0);

    const positionsAfter = await seedPositions();
    expect(positionsAfter.some((position) => position.id === target.id)).toBe(false);
    const cashAfter = positionsAfter.find((position) => position.id === cashPile.id);
    expect(cashAfter?.quantity).toBe(cashPile.quantity + proceedsUsd / cashPriceUsd);

    expect(await positionHistoryFor(target.id)).toHaveLength(0);
    const cashHistory = await positionHistoryFor(cashPile.id);
    expect(cashHistory[0].mode).toBe('add');
    expect(cashHistory[0].costBasisUsd).toBe(proceedsUsd);
  });

  it('records sale proceeds on the history row without touching cash when no pile is linked', async () => {
    const { target, cashPile } = await findSeedPositions();
    const reduceQuantity = 0.3;
    const proceedsUsd = 20000;
    const nextQuantity = target.quantity - reduceQuantity;

    const updatedTarget = await readJson<Position>(
      await demoRequest(`/positions/${target.id}`, 'PUT', {
        quantity: nextQuantity,
        avgCostUsd: target.avgCostUsd,
        positionDelta: { mode: 'reduce', quantity: reduceQuantity, proceedsUsd },
      })
    );

    expect(updatedTarget.quantity).toBe(nextQuantity);
    expect(updatedTarget.avgCostUsd).toBe(target.avgCostUsd);

    const targetHistory = await positionHistoryFor(target.id);
    const reduceEntry = targetHistory[0];
    expect(reduceEntry.mode).toBe('reduce');
    expect(reduceEntry.proceedsUsd).toBe(proceedsUsd);
    expect(reduceEntry.operationId ?? null).toBeNull();

    const positionsAfter = await seedPositions();
    const cashAfter = positionsAfter.find((position) => position.id === cashPile.id);
    expect(cashAfter?.quantity).toBe(cashPile.quantity);
    expect(cashAfter?.avgCostUsd).toBe(cashPile.avgCostUsd);
  });

  it('rejects sale proceeds on an add delta', async () => {
    const { target } = await findSeedPositions();

    await expect(
      demoRequest(`/positions/${target.id}`, 'PUT', {
        quantity: target.quantity + 0.1,
        avgCostUsd: target.avgCostUsd,
        positionDelta: { mode: 'add', quantity: 0.1, totalCostUsd: 5000, proceedsUsd: 1000 },
      })
    ).rejects.toThrow('Sale proceeds are only supported when reducing a position');
  });

  it('rejects a linked cash pile on reduce when no positive proceeds are given', async () => {
    const { target, cashPile } = await findSeedPositions();

    await expect(
      demoRequest(`/positions/${target.id}`, 'PUT', {
        quantity: target.quantity - 0.2,
        avgCostUsd: target.avgCostUsd,
        fundingCashPositionId: cashPile.id,
        positionDelta: { mode: 'reduce', quantity: 0.2 },
      })
    ).rejects.toThrow('Sending proceeds to a cash pile requires a positive sale amount');
  });
});

describe('demo catalog matching with tickers shared across classes', () => {
  beforeEach(() => {
    resetDemoDataForTests();
  });

  const stablecoinX = {
    provider: 'yahoo',
    providerAssetId: 'USDE',
    symbol: 'USDE',
    name: 'StablecoinX Inc.',
    category: 'EQUITY',
    nativeCurrency: 'USD',
    exchange: 'NASDAQ',
  };

  async function addStablecoinX() {
    const response = await demoRequest('/assets/from-provider', 'POST', stablecoinX);
    return { status: response.status, asset: await readJson<Asset>(response) };
  }

  async function importPositions(...assets: Array<Record<string, unknown>>) {
    return readJson<{ results: Array<{ success: boolean; error?: string }> }>(
      await demoRequest('/positions/bulk', 'POST', {
        positions: assets.map((asset) => ({ asset, quantity: 5, avgCostUsd: 10 })),
      })
    );
  }

  const importedPosition = async (symbol: string, category: string) =>
    (await seedPositions()).find(
      (position) => position.asset.symbol === symbol && position.asset.category === category
    );

  it('seeds the Ethena USDe stablecoin and lists StablecoinX in equity search', async () => {
    const assets = await readJson<Asset[]>(await demoRequest('/assets'));
    const hits = await readJson<ProviderSearchResult[]>(
      await demoRequest('/assets/search?q=usde&category=EQUITY')
    );

    expect(assets.filter((asset) => asset.symbol === 'USDE').map((a) => a.category)).toEqual([
      'STABLECOIN',
    ]);
    expect(hits.map((hit) => [hit.symbol, hit.name])).toEqual([['USDE', 'StablecoinX Inc.']]);
  });

  it('creates StablecoinX as an equity instead of returning the stablecoin', async () => {
    const created = await addStablecoinX();
    const again = await addStablecoinX();

    expect(created.status).toBe(201);
    expect(created.asset).toMatchObject({ category: 'EQUITY', priceProvider: 'yahoo' });
    expect(created.asset.id).not.toBe('usde');
    expect([again.status, again.asset.id]).toEqual([200, created.asset.id]);
  });

  it('creates fiat cash whose ticker only an equity uses, and 409s a same-class duplicate', async () => {
    await demoRequest('/assets/from-provider', 'POST', {
      ...stablecoinX,
      providerAssetId: 'GBP',
      symbol: 'GBP',
      name: 'Pound ETF',
    });
    const cash = (symbol: string) =>
      demoRequest('/assets', 'POST', {
        symbol,
        name: `Cash ${symbol}`,
        category: 'CASH',
        priceProvider: 'manual',
        nativeCurrency: symbol,
        currentPriceUsd: 1.27,
      });

    const gbp = await cash('GBP');
    const usd = await cash('USD');

    expect(gbp.status).toBe(201);
    expect((await readJson<Asset>(gbp)).category).toBe('CASH');
    expect(usd.status).toBe(409);
  });

  it('binds imported positions by class and asks for a category when a ticker is shared', async () => {
    const { asset: equity } = await addStablecoinX();

    const results = await importPositions({
      symbol: 'USDE',
      name: 'StablecoinX Inc.',
      category: 'EQUITY',
      coingeckoId: null,
    });
    expect((await importedPosition('USDE', 'EQUITY'))?.assetId).toBe(equity.id);

    const ambiguous = await importPositions({ symbol: 'USDE', name: 'USDE' });

    expect(results.results[0].success).toBe(true);
    expect(ambiguous.results[0]).toEqual({
      success: false,
      symbol: 'USDE',
      error:
        'USDE matches more than one asset type (STABLECOIN, EQUITY); add "category" to this row',
    });
  });

  it('never matches an imported row to another asset because both lack a CoinGecko id', async () => {
    await importPositions({
      symbol: 'NVDA',
      name: 'NVIDIA',
      category: 'EQUITY',
      coingeckoId: null,
    });

    expect((await importedPosition('NVDA', 'EQUITY'))?.asset).toMatchObject({
      priceProvider: 'yahoo',
      providerAssetId: 'NVDA',
    });
  });

  it('imports a BTC ETF trade as its own equity rather than onto the bitcoin coin', async () => {
    await demoRequest('/trades/bulk-import', 'POST', [
      {
        asset: { coingeckoId: null, symbol: 'BTC', name: 'Bitcoin Mini Trust', category: 'EQUITY' },
        direction: 'LONG',
        entryPrice: 45,
        quantity: 10,
        entryDate: '2026-04-01',
      },
    ]);

    const [imported] = await readJson<Trade[]>(await demoRequest('/trades'));
    expect(imported.assetId).not.toBe('btc');
    expect(imported.asset).toMatchObject({
      symbol: 'BTC',
      category: 'EQUITY',
      priceProvider: 'yahoo',
      providerAssetId: 'BTC',
    });
  });

  it('creates a unit trust whose code is a stock ticker, and 409s a different share class', async () => {
    const fund = await demoRequest('/assets/unit-trust', 'POST', {
      symbol: 'AAPL',
      name: 'Apple Income Fund',
      nativeCurrency: 'USD',
    });
    const otherClass = await demoRequest('/assets/unit-trust', 'POST', {
      symbol: 'UT-GI-SGD',
      name: 'Global Income Fund USD',
      nativeCurrency: 'USD',
    });

    expect(fund.status).toBe(201);
    expect((await readJson<Asset>(fund)).category).toBe('UNIT_TRUST');
    expect(otherClass.status).toBe(409);
  });

  it('reuses a unit trust by its Yahoo pair before falling back to a fund-code slug', async () => {
    const first = await demoRequest('/assets/unit-trust', 'POST', {
      symbol: 'GIFUND',
      name: 'Global Income Fund',
      nativeCurrency: 'USD',
      yahooSymbol: '0P0001XYZ.SI',
    });
    const firstAsset = await readJson<Asset>(first);

    expect(first.status).toBe(201);
    expect(firstAsset).toMatchObject({ priceProvider: 'yahoo', providerAssetId: '0P0001XYZ.SI' });

    // A different ticker string but the same Yahoo pair reuses the same row.
    const again = await demoRequest('/assets/unit-trust', 'POST', {
      symbol: 'GI-FUND-RENAMED',
      name: 'Global Income Fund',
      nativeCurrency: 'USD',
      yahooSymbol: '0p0001xyz.si',
    });

    expect(again.status).toBe(200);
    expect((await readJson<Asset>(again)).id).toBe(firstAsset.id);
  });

  it('409s a unit-trust Yahoo pair that already belongs to a non-fund catalog row', async () => {
    // 'AAPL' is already seeded as a Yahoo-priced equity; a fund code that collides
    // with it must not silently adopt that row.
    const conflict = await demoRequest('/assets/unit-trust', 'POST', {
      symbol: 'AAPL-FUND',
      name: 'Apple Feeder Fund',
      nativeCurrency: 'USD',
      yahooSymbol: 'AAPL',
    });

    expect(conflict.status).toBe(409);
    expect(await readJson<{ error: string }>(conflict)).toEqual({
      error: 'Existing symbol belongs to a different fund or share class',
    });
  });

  it('binds a unit-trust import to its ISIN, and blocks a symbol clash with a different share class', async () => {
    const existing = await readJson<Asset>(
      await demoRequest('/assets/unit-trust', 'POST', {
        symbol: 'GIFUND2',
        name: 'Global Income Fund II',
        nativeCurrency: 'SGD',
        isin: 'SGXZ00000001',
      })
    );

    // Same ISIN and currency, different ticker string: still binds to the existing row.
    const byIsin = await importPositions({
      coingeckoId: null,
      symbol: 'GIFUND2-RENAMED',
      name: 'Global Income Fund II (renamed)',
      category: 'UNIT_TRUST',
      nativeCurrency: 'SGD',
      isin: 'SGXZ00000001',
    });

    expect(byIsin.results[0]).toEqual({ success: true, symbol: 'GIFUND2-RENAMED' });
    expect((await seedPositions()).some((p) => p.assetId === existing.id)).toBe(true);
    expect(
      (await readJson<Asset[]>(await demoRequest('/assets'))).some(
        (a) => a.symbol === 'GIFUND2-RENAMED'
      )
    ).toBe(false);

    // Same ticker as an existing fund, but a different ISIN: a different share class.
    const mismatch = await importPositions({
      coingeckoId: null,
      symbol: 'GIFUND2',
      name: 'Global Income Fund II (wrong class)',
      category: 'UNIT_TRUST',
      nativeCurrency: 'SGD',
      isin: 'SGXZ99999999',
    });

    expect(mismatch.results[0]).toEqual({
      success: false,
      symbol: 'GIFUND2',
      error: 'Existing asset belongs to a different fund or share class',
    });
  });

  it('heals an unpriced imported coin onto the identity a later CoinGecko import brings', async () => {
    // A crypto row imported without a coingeckoId can never be priced by the
    // refresh job (demoImportFeed's coingecko fallback needs one); this is the
    // demo-reachable stand-in for an older trade/position-imported equity row.
    await importPositions({
      coingeckoId: null,
      symbol: 'NEWCOIN',
      name: 'New Coin',
      category: 'LIQUID_CRYPTO',
    });
    const before = (await readJson<Asset[]>(await demoRequest('/assets'))).find(
      (a) => a.symbol === 'NEWCOIN'
    );
    expect(before).toMatchObject({ priceProvider: 'coingecko', providerAssetId: null });

    const healed = await demoRequest('/assets/from-coingecko', 'POST', {
      coingeckoId: 'new-coin-token',
      symbol: 'NEWCOIN',
      name: 'New Coin',
      category: 'LIQUID_CRYPTO',
    });
    const healedAsset = await readJson<Asset>(healed);

    expect(healed.status).toBe(200);
    expect(healedAsset.id).toBe(before!.id);
    expect(healedAsset).toMatchObject({
      priceProvider: 'coingecko',
      providerAssetId: 'new-coin-token',
      coingeckoId: 'new-coin-token',
    });
    expect(
      (await readJson<Asset[]>(await demoRequest('/assets'))).filter((a) => a.symbol === 'NEWCOIN')
    ).toHaveLength(1);
  });

  it('never self-heals an unpriced row onto an unrelated same-group category', async () => {
    // ANGEL and LIQUID_CRYPTO share the crypto category group, so a same-class
    // symbol match alone would let an unrelated coin import repoint an unpriced
    // private/ANGEL holding onto its coingeckoId — the backend's canAdoptIdentity
    // additionally requires an exact category match before healing.
    await importPositions({
      coingeckoId: null,
      symbol: 'SHARED',
      name: 'Private Angel Holding',
      category: 'ANGEL',
    });
    const before = (await readJson<Asset[]>(await demoRequest('/assets'))).find(
      (a) => a.symbol === 'SHARED' && a.category === 'ANGEL'
    );
    expect(before).toMatchObject({ priceProvider: 'coingecko', providerAssetId: null });

    const response = await demoRequest('/assets/from-coingecko', 'POST', {
      coingeckoId: 'shared-coin-token',
      symbol: 'SHARED',
      name: 'Shared Coin',
      category: 'LIQUID_CRYPTO',
    });
    const returned = await readJson<Asset>(response);

    // Matches the backend: a same-group-but-wrong-category symbol match is
    // returned as-is (still the ANGEL row, still unpriced) — it is never
    // rewritten onto the unrelated coin's provider identity.
    expect(response.status).toBe(200);
    expect(returned).toMatchObject({
      id: before!.id,
      category: 'ANGEL',
      priceProvider: 'coingecko',
      providerAssetId: null,
    });
  });

  it('never self-heals from-provider onto an unrelated same-group category', async () => {
    // Same guard as the from-coingecko case above, exercised through
    // /assets/from-provider: NFT and ANGEL share the crypto category group, so an
    // unpriced NFT row must not adopt an unrelated ANGEL import's identity.
    await importPositions({
      coingeckoId: null,
      symbol: 'SHAREDTKR',
      name: 'Private NFT Holding',
      category: 'NFT',
    });
    const before = (await readJson<Asset[]>(await demoRequest('/assets'))).find(
      (a) => a.symbol === 'SHAREDTKR' && a.category === 'NFT'
    );
    expect(before).toMatchObject({ priceProvider: 'coingecko', providerAssetId: null });

    const response = await demoRequest('/assets/from-provider', 'POST', {
      provider: 'coingecko',
      providerAssetId: 'shared-token',
      symbol: 'SHAREDTKR',
      name: 'Shared Angel Holding',
      category: 'ANGEL',
    });
    const returned = await readJson<Asset>(response);

    // Matches the backend: the same-group-but-wrong-category NFT row is returned
    // untouched, never rewritten onto the unrelated ANGEL import's identity.
    expect(response.status).toBe(200);
    expect(returned).toMatchObject({
      id: before!.id,
      category: 'NFT',
      priceProvider: 'coingecko',
      providerAssetId: null,
    });
  });

  it('uppercases a unit-trust ISIN before storing it', async () => {
    const created = await readJson<Asset>(
      await demoRequest('/assets/unit-trust', 'POST', {
        symbol: 'CASEFUND',
        name: 'Case Fund',
        nativeCurrency: 'SGD',
        isin: 'sg1234567890',
      })
    );

    expect(created.isin).toBe('SG1234567890');
  });

  it('binds a unit-trust import to an ISIN regardless of case, on both sides', async () => {
    const existing = await readJson<Asset>(
      await demoRequest('/assets/unit-trust', 'POST', {
        symbol: 'CASEFUND2',
        name: 'Case Fund II',
        nativeCurrency: 'SGD',
        isin: 'sg9876543210',
      })
    );
    expect(existing.isin).toBe('SG9876543210');

    // A normalized import payload sends the ISIN upper-cased; it must still bind
    // to the fund created above rather than creating a duplicate catalog row.
    const bound = await importPositions({
      coingeckoId: null,
      symbol: 'CASEFUND2-RENAMED',
      name: 'Case Fund II (renamed)',
      category: 'UNIT_TRUST',
      nativeCurrency: 'SGD',
      isin: 'SG9876543210',
    });

    expect(bound.results[0]).toEqual({ success: true, symbol: 'CASEFUND2-RENAMED' });
    expect((await seedPositions()).some((p) => p.assetId === existing.id)).toBe(true);
    expect(
      (await readJson<Asset[]>(await demoRequest('/assets'))).filter(
        (a) => a.isin === 'SG9876543210'
      )
    ).toHaveLength(1);
  });
});

describe('demo price feeds for imported and healed rows', () => {
  beforeEach(() => {
    resetDemoDataForTests();
  });

  async function importPosition(asset: Record<string, unknown>) {
    await demoRequest('/positions/bulk', 'POST', {
      positions: [{ asset, quantity: 1, avgCostUsd: 1 }],
    });
    const assets = await readJson<Asset[]>(await demoRequest('/assets'));
    return assets.find((item) => item.symbol === String(asset.symbol).toUpperCase())!;
  }

  it('leaves a non-USD equity with a bare ticker unpriced rather than on the US listing', async () => {
    const dbs = await importPosition({
      symbol: 'D05',
      name: 'DBS',
      category: 'EQUITY',
      nativeCurrency: 'SGD',
    });

    expect([dbs.priceProvider, dbs.providerAssetId]).toEqual(['yahoo', null]);
  });

  it('gives a healed coin its CoinGecko id when the identity arrives through from-provider', async () => {
    const dead = await importPosition({ symbol: 'QAX', name: 'QA X', category: 'LIQUID_CRYPTO' });
    expect(dead.providerAssetId).toBeNull();

    const healed = await readJson<Asset>(
      await demoRequest('/assets/from-provider', 'POST', {
        provider: 'coingecko',
        providerAssetId: 'qa-x',
        symbol: 'QAX',
        name: 'QA X',
        category: 'LIQUID_CRYPTO',
        nativeCurrency: ' usd ',
      })
    );

    expect(healed).toMatchObject({
      id: dead.id,
      providerAssetId: 'qa-x',
      coingeckoId: 'qa-x',
      nativeCurrency: 'USD',
    });
  });
});

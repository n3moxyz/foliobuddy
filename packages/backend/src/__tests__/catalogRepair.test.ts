import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findFirstIn, findManyIn, matchesWhere } from './helpers/catalog.js';

type Row = Record<string, unknown>;
type RefTable = 'position' | 'positionHistory' | 'trade' | 'snapshotPosition';
const state = vi.hoisted(() => ({
  catalog: [] as Record<string, unknown>[],
  refs: {} as Record<string, Record<string, unknown>[]>,
  // A table whose move silently misses rows, as a concurrent insert would.
  stuck: null as string | null,
  calls: [] as string[],
  transaction: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => {
  // Reference tables answer real where-clauses, so a move in the wrong direction or
  // over the wrong rows shows up in the data, not only in the call log.
  const refTable = (name: string) => ({
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      state.calls.push(`${name}.updateMany`);
      if (state.stuck === name) return { count: 0 };
      const rows = state.refs[name].filter((row) => matchesWhere(row, where));
      rows.forEach((row) => Object.assign(row, data));
      return { count: rows.length };
    },
    count: async ({ where }: { where: Row }) =>
      state.refs[name].filter((row) => matchesWhere(row, where)).length,
  });
  const tx = {
    asset: {
      // Real Postgres returns rows in no fixed order; honour only an explicit id sort.
      findMany: async (args: { where?: Row; orderBy?: { id?: string } }) => {
        const rows = await findManyIn(state.catalog)(args);
        return args.orderBy?.id === 'asc'
          ? [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)))
          : rows;
      },
      findFirst: async (args: { where: Row }) => findFirstIn(state.catalog)(args),
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        state.calls.push(`asset.update:${where.id}`);
        const row = state.catalog.find((asset) => asset.id === where.id);
        Object.assign(row!, data);
        return row;
      },
      // Mirrors onDelete: Cascade, so a reference left behind is lost like in Postgres.
      delete: async ({ where }: { where: { id: string } }) => {
        state.calls.push(`asset.delete:${where.id}`);
        state.catalog = state.catalog.filter((asset) => asset.id !== where.id);
        for (const table of ['position', 'positionHistory', 'trade']) {
          state.refs[table] = state.refs[table].filter((row) => row.assetId !== where.id);
        }
      },
    },
    position: refTable('position'),
    positionHistory: refTable('positionHistory'),
    trade: refTable('trade'),
    snapshotPosition: refTable('snapshotPosition'),
  };
  return {
    prisma: {
      $transaction: (work: (client: typeof tx) => unknown, options: unknown) => {
        state.transaction(options);
        return work(tx);
      },
    },
  };
});
vi.mock('../lib/logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { repairUnpricedEquities } = await import('../services/catalogRepair.js');

const equity = (
  id: string,
  symbol: string,
  priceProvider = 'coingecko',
  providerAssetId: string | null = null,
  listing: { nativeCurrency?: string; exchange?: string | null } = {}
) => ({
  id,
  symbol,
  name: `${symbol} Inc.`,
  category: 'EQUITY',
  priceProvider,
  providerAssetId,
  nativeCurrency: 'USD',
  exchange: null,
  ...listing,
});
/** A live, Yahoo-priced row already holding the USDE ticker. */
const STABLECOINX_LIVE = equity('z-live', 'USDE', 'yahoo', 'USDE', { exchange: 'NasdaqCM' });
const REFERENCE_MOVES = [
  'position.updateMany',
  'positionHistory.updateMany',
  'trade.updateMany',
  'snapshotPosition.updateMany',
];
const actions = (changes: { action: string }[]) => changes.map(({ action }) => action);

/** Each table holds a dead-row reference, a live-row reference and an unrelated one. */
function seedReferences() {
  const tables: RefTable[] = ['position', 'positionHistory', 'trade', 'snapshotPosition'];
  state.refs = Object.fromEntries(
    tables.map((table) => [
      table,
      [
        { id: `${table}-dead`, assetId: 'a-dead' },
        { id: `${table}-live`, assetId: 'z-live' },
        { id: `${table}-other`, assetId: 'x-other' },
      ],
    ])
  );
}

const assetIdsOf = (table: RefTable) =>
  Object.fromEntries(state.refs[table].map((row) => [row.id, row.assetId]));

beforeEach(() => {
  state.calls = [];
  state.stuck = null;
  seedReferences();
  state.transaction.mockClear();
});

describe('repairUnpricedEquities', () => {
  it('reports a lone dead row in dry run without writing', async () => {
    state.catalog = [equity('a-kioxia', 'kioxia')];
    const changes = await repairUnpricedEquities();
    expect(changes).toEqual([
      {
        assetId: 'a-kioxia',
        ticker: 'KIOXIA',
        name: 'kioxia Inc.',
        nativeCurrency: 'USD',
        exchange: null,
        action: 'would repair',
      },
    ]);
    expect(state.calls).toEqual([]);
    expect(state.catalog[0]).toMatchObject({ priceProvider: 'coingecko', providerAssetId: null });
    expect(state.transaction).toHaveBeenCalledWith({
      isolationLevel: 'Serializable',
      timeout: 60_000,
    });
  });

  it('points a lone dead row at its Yahoo ticker on apply', async () => {
    state.catalog = [equity('a-kioxia', 'kioxia')];
    const changes = await repairUnpricedEquities({ apply: true });
    expect(changes[0].action).toBe('repaired');
    expect(state.catalog[0]).toMatchObject({ priceProvider: 'yahoo', providerAssetId: 'KIOXIA' });
  });

  it('refuses to bind a non-USD row to a bare ticker, which Yahoo reads as the US listing', async () => {
    state.catalog = [
      equity('a-dbs', 'D05', 'coingecko', null, { nativeCurrency: 'SGD' }),
      equity('b-dbs', 'D05.SI', 'coingecko', null, { nativeCurrency: 'SGD' }),
      equity('c-dbs', 'D05', 'coingecko', null, { nativeCurrency: 'SGD' }),
    ];
    const changes = await repairUnpricedEquities({ apply: true, mergeDuplicates: true });
    // The second bare D05 must not be merged into the first, which was never repaired.
    expect(actions(changes)).toEqual([
      'conflict: SGD listing D05 has no Yahoo exchange suffix',
      'repaired',
      'conflict: SGD listing D05 has no Yahoo exchange suffix',
    ]);
    expect(state.calls).toEqual(['asset.update:b-dbs']);
  });

  it('leaves manual equities, priced equities and non-equity dead rows alone', async () => {
    state.catalog = [
      equity('a-manual', 'PRIV', 'manual'),
      equity('a-priced', 'NVDA', 'yahoo', 'NVDA'),
      { ...equity('a-coin', 'DOGE'), category: 'LIQUID_CRYPTO' },
    ];
    expect(await repairUnpricedEquities({ apply: true, mergeDuplicates: true })).toEqual([]);
    expect(state.calls).toEqual([]);
  });

  it('reports a duplicate of a live row and writes nothing without the flag', async () => {
    state.catalog = [equity('a-dead', 'usde'), { ...STABLECOINX_LIVE }];
    const changes = await repairUnpricedEquities({ apply: true });
    expect(actions(changes)).toEqual(['duplicate: rerun with --merge-duplicates']);
    expect(state.calls).toEqual([]);
  });

  it('describes the merge in a dry run without writing', async () => {
    state.catalog = [equity('a-dead', 'USDE'), { ...STABLECOINX_LIVE }];
    const changes = await repairUnpricedEquities({ mergeDuplicates: true });
    expect(changes[0].action).toBe('would merge into z-live');
    expect(state.calls).toEqual([]);
  });

  it('repoints only the dead row references to the holder before deleting it', async () => {
    state.catalog = [equity('a-dead', 'USDE'), { ...STABLECOINX_LIVE }];
    const changes = await repairUnpricedEquities({ apply: true, mergeDuplicates: true });
    expect(changes[0].action).toBe('merged into z-live');
    expect(state.calls).toEqual([...REFERENCE_MOVES, 'asset.delete:a-dead']);
    expect(state.catalog.map((asset) => asset.id)).toEqual(['z-live']);
    for (const table of ['position', 'positionHistory', 'trade', 'snapshotPosition'] as const) {
      expect(assetIdsOf(table)).toEqual({
        [`${table}-dead`]: 'z-live',
        [`${table}-live`]: 'z-live',
        [`${table}-other`]: 'x-other',
      });
    }
  });

  it.each(['position', 'positionHistory', 'trade'] as const)(
    'aborts without deleting when a %s reference remains after the move',
    async (table) => {
      state.catalog = [equity('a-dead', 'USDE'), { ...STABLECOINX_LIVE }];
      state.stuck = table;
      await expect(repairUnpricedEquities({ apply: true, mergeDuplicates: true })).rejects.toThrow(
        /still has references/
      );
      expect(state.calls).not.toContain('asset.delete:a-dead');
      expect(state.catalog).toHaveLength(2);
      expect(assetIdsOf(table)[`${table}-dead`]).toBe('a-dead');
    }
  );

  it('reports a different listing behind the same ticker instead of merging', async () => {
    state.catalog = [
      equity('a-sea', 'SE', 'coingecko', null, { nativeCurrency: 'SGD' }),
      equity('b-sea', 'SE', 'coingecko', null, { exchange: 'NYSE Arca' }),
      equity('z-sea', 'SE', 'yahoo', 'SE', { exchange: 'NYSE' }),
    ];
    const changes = await repairUnpricedEquities({ apply: true, mergeDuplicates: true });
    expect(actions(changes)).toEqual([
      'conflict: z-sea (SE Inc., USD NYSE) is a different listing',
      'conflict: z-sea (SE Inc., USD NYSE) is a different listing',
    ]);
    expect(state.calls).toEqual([]);
  });

  it('merges a suffixed ticker whose stored currency is only the import default', async () => {
    // Trade imports carry no currency, so a dead D05.SI row says USD; the suffix
    // already names the SGX listing, and the exchange labels need not match either.
    state.catalog = [
      equity('a-dead', 'D05.SI', 'coingecko', null, { exchange: 'SGX' }),
      equity('z-live', 'D05.SI', 'yahoo', 'D05.SI', { nativeCurrency: 'SGD', exchange: 'SES' }),
    ];
    const changes = await repairUnpricedEquities({ apply: true, mergeDuplicates: true });
    expect(actions(changes)).toEqual(['merged into z-live']);
    expect(state.calls).toEqual([...REFERENCE_MOVES, 'asset.delete:a-dead']);
  });

  it('repairs the first of two dead rows and treats the second as its duplicate', async () => {
    state.catalog = [equity('b-second', 'SOFI'), equity('a-first', 'sofi')];
    expect(actions(await repairUnpricedEquities())).toEqual([
      'would repair',
      'duplicate: rerun with --merge-duplicates',
    ]);
    const merged = await repairUnpricedEquities({ apply: true, mergeDuplicates: true });
    expect(actions(merged)).toEqual(['repaired', 'merged into a-first']);
    expect(state.calls).toEqual([
      'asset.update:a-first',
      ...REFERENCE_MOVES,
      'asset.delete:b-second',
    ]);
  });

  it('flags a blank symbol instead of claiming an empty Yahoo id', async () => {
    state.catalog = [equity('a-blank', '  ')];
    const changes = await repairUnpricedEquities({ apply: true });
    expect(changes).toMatchObject([
      { assetId: 'a-blank', ticker: '', action: 'conflict: blank symbol' },
    ]);
    expect(state.calls).toEqual([]);
  });

  it('reports a conflict for every dead row whose Yahoo ticker a non-equity row holds', async () => {
    state.catalog = [
      equity('a-dead', 'FUND'),
      equity('b-dead', 'fund'),
      { ...equity('u-trust', 'FUND', 'yahoo', 'FUND'), category: 'UNIT_TRUST' },
    ];
    const changes = await repairUnpricedEquities({ apply: true, mergeDuplicates: true });
    expect(changes).toMatchObject([
      {
        assetId: 'a-dead',
        ticker: 'FUND',
        action: 'conflict: yahoo FUND belongs to UNIT_TRUST u-trust',
      },
      {
        assetId: 'b-dead',
        ticker: 'FUND',
        action: 'conflict: yahoo FUND belongs to UNIT_TRUST u-trust',
      },
    ]);
    expect(state.calls).toEqual([]);
  });
});

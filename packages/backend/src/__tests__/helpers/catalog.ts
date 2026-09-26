type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const SUPPORTED_FILTERS = new Set(['in', 'notIn', 'lte']);

/**
 * Minimal Prisma `where` evaluator (equality, `in`, `notIn`, `lte`, `OR`) so catalog
 * mocks answer lookups the way Postgres would, instead of tests asserting query
 * shapes. Unsupported operators throw rather than silently matching.
 */
export function matchesWhere(row: Row, where: Where): boolean {
  return Object.entries(where).every(([field, condition]) => {
    if (field === 'OR') {
      return (condition as Where[]).some((clause) => matchesWhere(row, clause));
    }
    if (condition !== null && typeof condition === 'object') {
      const filter = condition as { in?: unknown[]; notIn?: unknown[]; lte?: unknown };
      const unsupported = Object.keys(filter).filter((op) => !SUPPORTED_FILTERS.has(op));
      if (unsupported.length > 0) {
        throw new Error(`matchesWhere: unsupported filter ${unsupported.join(', ')} on ${field}`);
      }
      if (filter.in && !filter.in.includes(row[field])) return false;
      if (filter.notIn && filter.notIn.includes(row[field])) return false;
      // Numbers and Dates both compare by value; a missing field never matches.
      if ('lte' in filter && !(Number(row[field]) <= Number(filter.lte))) return false;
      return true;
    }
    return row[field] === condition;
  });
}

/** `findFirst` stand-in over a fixed catalog, returning the first match like Prisma. */
export function findFirstIn<T extends Row>(catalog: T[]) {
  return async ({ where }: { where: Where }) =>
    catalog.find((row) => matchesWhere(row, where)) ?? null;
}

/** `findMany` stand-in over a fixed catalog; `where` is optional, as in Prisma. */
export function findManyIn<T extends Row>(catalog: T[]) {
  return async ({ where }: { where?: Where } = {}) =>
    catalog.filter((row) => !where || matchesWhere(row, where));
}

/** Ethena USDe as the CoinGecko flow stores it: symbol upper-cased to USDE. */
export const ETHENA_USDE = {
  id: 'ethena-usde-row',
  coingeckoId: 'ethena-usde',
  priceProvider: 'coingecko',
  providerAssetId: 'ethena-usde',
  symbol: 'USDE',
  name: 'Ethena USDe',
  category: 'STABLECOIN',
  nativeCurrency: 'USD',
  exchange: null,
  currentPriceUsd: 1,
};

/** StablecoinX Inc., the Nasdaq equity that trades under the same ticker. */
export const STABLECOINX = {
  id: 'stablecoinx-row',
  coingeckoId: null,
  priceProvider: 'yahoo',
  providerAssetId: 'USDE',
  symbol: 'USDE',
  name: 'StablecoinX Inc.',
  category: 'EQUITY',
  nativeCurrency: 'USD',
  exchange: 'NasdaqCM',
  currentPriceUsd: 16.875,
};

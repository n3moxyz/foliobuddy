export const PORTFOLIO_GROUP_ORDER_QUERY_KEY = ['user', 'portfolio-group-orders'] as const;
export const PORTFOLIO_GROUP_ORDER_PATH = '/users/me/preferences/portfolio-group-orders';

const SECTIONS = {
  crypto: ['storage'],
  cash: ['storage'],
  custody: ['storage'],
  equities: ['broker', 'equityType'],
} as const;

export type PortfolioGroupScope =
  | 'crypto:storage'
  | 'cash:storage'
  | 'custody:storage'
  | 'equities:broker'
  | 'equities:equityType';
export type PortfolioGroupOrders = Partial<Record<PortfolioGroupScope, string[]>>;
export type PortfolioGroupOrderUpdate = { scope: PortfolioGroupScope; order: string[] };

export function readLegacyPortfolioGroupOrders(ownerId: string): PortfolioGroupOrders {
  const orders: PortfolioGroupOrders = {};
  for (const [section, modes] of Object.entries(SECTIONS)) {
    try {
      const key = `foliobuddy-position-group-order:${encodeURIComponent(ownerId)}:${section}`;
      const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown> | null;
      for (const mode of modes) {
        const order = saved?.[mode];
        if (!Array.isArray(order)) continue;
        const keys = [
          ...new Set(
            order.filter(
              (item): item is string =>
                typeof item === 'string' && item.length > 0 && item.length <= 2048
            )
          ),
        ].slice(0, 256);
        if (keys.length) orders[`${section}:${mode}` as PortfolioGroupScope] = keys;
      }
    } catch {
      // A corrupt or unavailable browser preference cannot block the account preference.
    }
  }
  return orders;
}

export function mergeVisibleGroupOrder(previous: readonly string[], keys: string[]) {
  const visible = new Set(keys);
  let index = 0;
  const preserved = previous.map((key) => (visible.has(key) ? keys[index++] : key));
  return [...preserved, ...keys.slice(index)];
}

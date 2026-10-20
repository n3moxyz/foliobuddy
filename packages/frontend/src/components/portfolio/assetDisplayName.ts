import type { Asset } from '@/lib/types';

const COMPANY_SHORT_NAMES = new Map([
  ['samsung electronics', 'Samsung'],
  ['samsung electro-mechanics', 'Samsung EM'],
  ['kioxia holdings', 'KIOXIA'],
  ['murata manufacturing', 'Murata'],
  ['ibiden', 'Ibiden'],
  ['sed energy holdings', 'SED Energy'],
  ['nebius group', 'Nebius'],
  ['meta platforms', 'Meta'],
  ['dbs group holdings', 'DBS'],
  ['singapore exchange', 'SGX'],
  ['sheng siong group', 'Sheng Siong'],
]);

const COMPANY_SUFFIX =
  /(?:,\s*|\s+)(?:co\.?,?\s*ltd\.?|inc(?:orporated)?\.?|corp(?:oration)?\.?|ltd\.?|limited|plc|n\.v\.)$/i;

/** Compact row label only; keep the original name for details, forms and exports. */
export function assetDisplayName(asset: Pick<Asset, 'name' | 'category'>): string {
  if (asset.category !== 'EQUITY') return asset.name;

  const companyName = asset.name.replace(COMPANY_SUFFIX, '').trim();
  return COMPANY_SHORT_NAMES.get(companyName.toLowerCase()) ?? (companyName || asset.name);
}

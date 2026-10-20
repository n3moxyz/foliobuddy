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

const FUND_SHORT_NAMES = new Map([
  ['amova singapore equity', 'Amova SG Equity'],
  ['lionglobal singapore dividend equity', 'LionGlobal SG Dividend'],
]);

const COMPANY_SUFFIX =
  /(?:,\s*|\s+)(?:co\.?,?\s*ltd\.?|inc(?:orporated)?\.?|corp(?:oration)?\.?|ltd\.?|limited|plc|n\.v\.)$/i;
const FORMER_NAME = /\s*\(formerly [^)]*\)/gi;
const FUND_CURRENCY_SUFFIX = /\s+(?:SGD|USD|GBP|EUR|JPY|AUD|HKD)(?:\s*\([^)]*\))?$/i;

export interface AssetIdentity {
  symbol: string;
  name?: string;
  category?: string | null;
}

/** Summary labels only; details, forms, matching and exports keep the original name. */
export function assetDisplayName(asset: AssetIdentity): string {
  const fullName = asset.name?.trim() || asset.symbol;
  if (asset.category === 'CASH' || asset.category === 'STABLECOIN') return 'Cash';
  if (asset.category && asset.category !== 'EQUITY' && asset.category !== 'UNIT_TRUST') {
    return fullName;
  }

  const name = fullName.replace(FORMER_NAME, '').trim();
  const fundName = name.replace(FUND_CURRENCY_SUFFIX, '').trim();
  const knownFund = FUND_SHORT_NAMES.get(fundName.toLowerCase());
  if (knownFund) return knownFund;
  if (asset.category === 'UNIT_TRUST') return fundName || fullName;

  const companyName = name.replace(COMPANY_SUFFIX, '').trim();
  return COMPANY_SHORT_NAMES.get(companyName.toLowerCase()) ?? (companyName || fullName);
}

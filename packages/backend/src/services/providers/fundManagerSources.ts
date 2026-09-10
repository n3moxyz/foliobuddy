/** Deliberately small allowlist: never infer a share class from a fuzzy fund name. */
export const FUND_MANAGER_SOURCES = [
  {
    isin: 'SG9999004360',
    name: 'Amova Singapore Equity Fund - SGD Class',
    currency: 'SGD',
    manager: 'Amova',
    url: 'https://sg.amova-am.com/general/funds/detail/amova-singapore-equity-fund-sgd-class',
    legacy: {
      id: 'cmovl3whp05bzbbbozlkca82e',
      symbol: 'AMOVASIN',
      provider: 'manual',
      providerAssetId: 'ut-amovasin',
      name: 'Amova Singapore Equity SGD (formerly Nikko AM)',
    },
  },
  {
    isin: 'SGXZ58947870',
    name: 'LionGlobal Singapore Dividend Equity Fund Class SGD (Dec)',
    currency: 'SGD',
    manager: 'LionGlobal',
    url: 'https://www.lionglobalinvestors.com/en/fund.html?officialNav=LSSD',
    yahooSymbol: '0P0001OPAN.SI',
  },
] as const;

export type FundManagerSource = (typeof FUND_MANAGER_SOURCES)[number];

export function findFundManagerSource(asset: {
  id?: string;
  isin?: string | null;
  category?: string;
  nativeCurrency: string;
  priceProvider?: string;
  providerAssetId?: string | null;
  symbol?: string;
  name?: string;
}): FundManagerSource | undefined {
  if (asset.category && asset.category !== 'UNIT_TRUST') return undefined;
  return FUND_MANAGER_SOURCES.find((fund) => {
    if (asset.nativeCurrency.toUpperCase() !== fund.currency) return false;
    if (asset.isin?.trim()) return asset.isin.trim().toUpperCase() === fund.isin;
    if ('yahooSymbol' in fund && asset.priceProvider === 'yahoo') {
      return asset.providerAssetId === fund.yahooSymbol;
    }
    return (
      'legacy' in fund &&
      asset.id === fund.legacy.id &&
      asset.symbol === fund.legacy.symbol &&
      asset.name === fund.legacy.name &&
      asset.priceProvider === fund.legacy.provider &&
      asset.providerAssetId === fund.legacy.providerAssetId
    );
  });
}

export function parseNavDate(value: string, now = new Date()): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid NAV date');
  const date = new Date(`${value}T00:00:00.000Z`);
  const todaySingapore = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    value > todaySingapore ||
    value < '1990-01-01'
  ) {
    throw new Error('Invalid or future NAV date');
  }
  return date;
}

export function positiveNav(value: string): number {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error('Invalid NAV number');
  const nav = Number(value);
  if (!Number.isFinite(nav) || nav <= 0) throw new Error('NAV must be positive and finite');
  return nav;
}

export interface ManagerNav {
  isin: string;
  nativeCurrency: string;
  nativePrice: number;
  asOf: Date;
}

// Extract only the observed header/quote contract, never another class's option,
// performance table, search result, or an unlabelled number elsewhere in the page.
export function parseAmovaNav(html: string, now = new Date()): ManagerNav {
  const title = html.match(/<h1\b[^>]*>([^<]*)<\/h1>/i)?.[1]?.trim();
  const isin = html.match(/<span\b[^>]*>\s*([A-Z0-9]{12})\s*<\/span>\s*ISIN Number/i)?.[1];
  const quote = html.match(
    /<div\b[^>]*>\s*NAV\s*<\/div>\s*<div\b[^>]*>\s*([A-Z]{3})\s+([^<]+)<\/div>\s*<div\b[^>]*>\s*as of\s+(\d{2}) ([A-Za-z]{3}) (\d{4})\s*<\/div>/i
  );
  if (
    title !== FUND_MANAGER_SOURCES[0].name ||
    isin !== FUND_MANAGER_SOURCES[0].isin ||
    !quote ||
    quote[1] !== 'SGD'
  )
    throw new Error('Amova NAV identity/currency mismatch');
  const month = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ].indexOf(quote[4]);
  return {
    isin,
    nativeCurrency: quote[1],
    nativePrice: positiveNav(quote[2].trim()),
    asOf: parseNavDate(`${quote[5]}-${String(month + 1).padStart(2, '0')}-${quote[3]}`, now),
  };
}

function xmlField(xml: string, tag: string): string {
  const matches = [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))];
  if (matches.length !== 1) throw new Error(`Missing or ambiguous LionGlobal ${tag}`);
  return matches[0][1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').trim();
}

function validateXmlRecord(xml: string, root: 'funds' | 'facts', record: 'fund' | 'item') {
  const match = xml
    .trim()
    .match(
      new RegExp(`^<${root}(?: totalpage="1")?><${record}>([\\s\\S]*)</${record}></${root}>$`)
    );
  if (!match) throw new Error('Malformed manager XML envelope');
  // This endpoint's record is a flat sequence of text/CDATA fields. Reject
  // nested/unclosed tags, DTDs, entities, and extra records instead of guessing.
  const remainder = match[1]
    .replace(/<([a-z_]+)>(?:<!\[CDATA\[[\s\S]*?\]\]>|[^<>]*)<\/\1>/g, '')
    .trim();
  if (remainder) throw new Error('Malformed manager XML fields');
}

export function parseLionGlobalNav(xml: string, facts: string, now = new Date()): ManagerNav {
  validateXmlRecord(xml, 'funds', 'fund');
  validateXmlRecord(facts, 'facts', 'item');
  if (
    (xml.match(/<fund>/g) ?? []).length !== 1 ||
    (facts.match(/<item>/g) ?? []).length !== 1 ||
    xmlField(xml, 'f_code') !== 'LSSD' ||
    xmlField(xml, 'eng_lgi') !== FUND_MANAGER_SOURCES[1].name ||
    xmlField(facts, 'isin') !== FUND_MANAGER_SOURCES[1].isin ||
    xmlField(xml, 'currency') !== 'SGD' ||
    xmlField(facts, 'currency') !== 'SGD' ||
    xmlField(facts, 'valuation_frequency') !== 'Daily'
  ) {
    throw new Error('LionGlobal NAV identity/currency mismatch');
  }
  return {
    isin: FUND_MANAGER_SOURCES[1].isin,
    nativeCurrency: 'SGD',
    nativePrice: positiveNav(xmlField(xml, 'nav')),
    asOf: parseNavDate(xmlField(xml, 'dealdate'), now),
  };
}

async function fetchSource(url: string): Promise<string> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
    headers: { Accept: 'text/html, application/xml', 'User-Agent': 'FolioBuddy/1.0' },
  });
  if (!response.ok) throw new Error(`Manager source HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 1_000_000) throw new Error('Manager response exceeds size limit');
  return text;
}

export async function fetchManagerNav(isin: string): Promise<ManagerNav> {
  if (isin === FUND_MANAGER_SOURCES[0].isin) {
    return parseAmovaNav(await fetchSource(FUND_MANAGER_SOURCES[0].url));
  }
  if (isin === FUND_MANAGER_SOURCES[1].isin) {
    const [xml, facts] = await Promise.all([
      fetchSource('https://api.lionglobalinvestors.com/fundlist?fcode=LSSD'),
      fetchSource('https://api.lionglobalinvestors.com/ffacts?fcode=LSSD'),
    ]);
    return parseLionGlobalNav(xml, facts);
  }
  throw new Error('Unsupported manager share class');
}

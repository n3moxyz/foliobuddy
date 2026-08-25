// Publisher credibility classification for the News feed.
//
// Tier semantics (see CLAUDE.md "News Tab"):
//   1 = primary/authoritative (regulators, central banks, official IR/newsrooms)
//   2 = high-quality independent reporting with accountable editorial standards
//   3 = credible specialist coverage (crypto/tech/regional press, named research)
//   4 = low-confidence/discovery (content farms, promo syndication) AND the
//       neutral default for unknown publishers — unknown means unrated, not bad,
//       so unknown publishers get tier 4 scoring with a null label.
//
// Yahoo's publisher string is the primary key; the article domain is a second
// signal (official .gov / IR domains can arrive under unexpected labels).
// A tier is a prior about the source, never a claim that an article is verified.

export type SourceTier = 1 | 2 | 3 | 4;

export interface SourceClassification {
  tier: SourceTier;
  /** Short user-facing label; null when the publisher is unrated. */
  label: string | null;
  /** True only for recognised official/authoritative origins. */
  primary: boolean;
  /** True for clearly spammy or deceptive sources — suppress entirely. */
  denied: boolean;
}

const TIER_LABELS: Record<SourceTier, string> = {
  1: 'Primary source',
  2: 'Trusted press',
  3: 'Specialist',
  4: 'Low confidence',
};

export function normalizePublisher(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.(com|co|io|org|net)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function domainFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return null;
  }
}

// Keep small and only for clearly spammy or deceptive sources — quality
// concerns belong in tier 4, not here.
const DENYLIST_PUBLISHERS = new Set(
  ['analytics insight', 'the coin republic', 'investingcube', 'captainaltcoin', 'coinpedia'].map(
    normalizePublisher
  )
);

interface PublisherRule {
  tier: SourceTier;
  label?: string;
  primary?: boolean;
}

function rules(tier: SourceTier, names: string[], extra: Partial<PublisherRule> = {}) {
  return names.map((name) => [normalizePublisher(name), { tier, ...extra }] as const);
}

// Tier 1 / primary status is granted ONLY by an official domain
// (isOfficialDomain) — never by the publisher string alone. A Yahoo result
// labeled "SEC" or "Federal Reserve" on a random domain is exactly the spoof
// the primary badge must not reward, so there are no tier-1 name rules here.
const PUBLISHER_TIERS = new Map<string, PublisherRule>([
  ...rules(2, [
    'Reuters',
    'Bloomberg',
    'Financial Times',
    'The Wall Street Journal',
    'Wall Street Journal',
    'WSJ',
    'Associated Press',
    'AP News',
    'AFP',
    'The Economist',
    'Nikkei',
    'Nikkei Asia',
    'CNBC',
    'Dow Jones Newswires',
    "Barron's",
    'The New York Times',
    'The Washington Post',
  ]),
  ...rules(3, [
    'Yahoo Finance',
    'MarketWatch',
    'Morningstar',
    "Investor's Business Daily",
    'Business Insider',
    'Fortune',
    'Forbes',
    'The Business Times',
    'The Straits Times',
    'South China Morning Post',
    'TechCrunch',
    'The Verge',
    'Ars Technica',
    'The Information',
    'The Register',
    "Tom's Hardware",
    'AnandTech',
    'DigiTimes',
    'SemiAnalysis',
    'CoinDesk',
    'The Block',
    'Blockworks',
    'Decrypt',
    'DL News',
    'Cointelegraph',
    'The Defiant',
    'Unchained',
    'Messari',
    'Kaiko',
    'Glassnode',
    'Seeking Alpha',
    'TipRanks',
  ]),
  ...rules(3, ['Business Wire', 'PR Newswire', 'GlobeNewswire'], { label: 'Press release' }),
  ...rules(4, [
    'The Motley Fool',
    'Motley Fool',
    'Zacks',
    'Zacks Investment Research',
    'InvestorPlace',
    'Simply Wall St',
    'GuruFocus',
    'Insider Monkey',
    '24/7 Wall St',
    'TheStreet',
    'Benzinga',
    'Investing.com',
    'U.Today',
    'AMBCrypto',
    'NewsBTC',
    'CryptoPotato',
    'CoinGape',
    'DailyCoin',
    'Cryptonews',
    'Bitcoinist',
    'ZyCrypto',
    'The Daily Hodl',
    'Watcher Guru',
    'Finbold',
    'BeInCrypto',
    'Accesswire',
    'Newsfile',
    'MarketBeat',
    'Stocktwits',
  ]),
]);

const PRIMARY_DOMAINS = ['ecb.europa.eu', 'bis.org', 'bankofengland.co.uk', 'imf.org'];

// "Primary source" must be earned by a recognised official domain — a
// registrable suffix, never a substring or a subdomain prefix. Anything a
// publisher can self-assign (ir./investor. subdomains, ".gov." appearing
// mid-hostname on an attacker-registered domain) must NOT grant tier 1.
function isOfficialDomain(domain: string): boolean {
  if (domain.endsWith('.gov')) return true;
  // Government ccTLD suffixes: mas.gov.sg, hmrc.gov.uk, govt.nz — anchored to
  // the END of the hostname so "sec.gov.uk.attacker.com" cannot qualify.
  if (/(^|\.)govt?\.[a-z]{2,3}$/.test(domain)) return true;
  return PRIMARY_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export function classifySource(publisher: string, url: string): SourceClassification {
  const normalized = normalizePublisher(publisher);
  const domain = domainFromUrl(url);

  if (DENYLIST_PUBLISHERS.has(normalized)) {
    return { tier: 4, label: TIER_LABELS[4], primary: false, denied: true };
  }

  if (domain && isOfficialDomain(domain)) {
    return { tier: 1, label: TIER_LABELS[1], primary: true, denied: false };
  }

  const rule = PUBLISHER_TIERS.get(normalized);
  if (rule) {
    return {
      tier: rule.tier,
      label: rule.label ?? TIER_LABELS[rule.tier],
      primary: rule.primary ?? false,
      denied: false,
    };
  }

  // Unknown publisher: neutral/low default — scored like tier 4, but with a
  // null label so the UI never mislabels an unrated source.
  return { tier: 4, label: null, primary: false, denied: false };
}

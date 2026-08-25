import { describe, expect, it } from 'vitest';
import {
  classifySource,
  domainFromUrl,
  normalizeOfficialDomain,
  normalizePublisher,
} from '../services/news/sourceQuality.js';

describe('normalizePublisher', () => {
  it('normalizes punctuation, casing, and web suffixes', () => {
    expect(normalizePublisher('The Wall Street Journal.')).toBe('the wall street journal');
    expect(normalizePublisher("Barron's")).toBe('barron s');
    expect(normalizePublisher('Investing.com')).toBe('investing');
    expect(normalizePublisher('  Reuters  ')).toBe('reuters');
  });
});

describe('normalizeOfficialDomain', () => {
  it('normalizes user-entered forms to a bare registrable domain', () => {
    expect(normalizeOfficialDomain('https://www.nvidia.com/en-us/')).toBe('nvidia.com');
    expect(normalizeOfficialDomain('Ethereum.org')).toBe('ethereum.org');
    expect(normalizeOfficialDomain('investor.dbs.com:443/reports')).toBe('investor.dbs.com');
  });

  it('rejects junk instead of storing it', () => {
    expect(normalizeOfficialDomain('')).toBeNull();
    expect(normalizeOfficialDomain(null)).toBeNull();
    expect(normalizeOfficialDomain('not a domain')).toBeNull();
    expect(normalizeOfficialDomain('nodots')).toBeNull();
  });
});

describe('domainFromUrl', () => {
  it('extracts the hostname without www and survives malformed urls', () => {
    expect(domainFromUrl('https://www.reuters.com/markets/x')).toBe('reuters.com');
    expect(domainFromUrl('not a url')).toBeNull();
  });
});

describe('classifySource', () => {
  it('classifies tier 2 wire services and tier 3 specialists', () => {
    const reuters = classifySource('Reuters', 'https://www.reuters.com/business/x');
    expect(reuters).toMatchObject({ tier: 2, primary: false, denied: false });

    const coindesk = classifySource('CoinDesk', 'https://www.coindesk.com/markets/x');
    expect(coindesk).toMatchObject({ tier: 3, label: 'Specialist', denied: false });
  });

  it('treats official government and regulator domains as primary tier 1', () => {
    const sec = classifySource('SEC Newsroom Feed', 'https://www.sec.gov/news/press-release/1');
    expect(sec).toMatchObject({ tier: 1, primary: true, label: 'Primary source' });

    const mas = classifySource('MAS', 'https://www.mas.gov.sg/news/media-releases/1');
    expect(mas.primary).toBe(true);
  });

  it('never grants tier 1 from a publisher label alone (spoofed-label regression)', () => {
    // Yahoo can attribute any publisher string — "SEC" on a random domain is
    // exactly what the primary badge must not reward.
    const spoofedLabel = classifySource('SEC', 'https://crypto-hype.example.net/breaking');
    expect(spoofedLabel).toEqual({ tier: 4, label: null, primary: false, denied: false });

    const spoofedFed = classifySource('Federal Reserve', 'https://newsblog.example.com/x');
    expect(spoofedFed.primary).toBe(false);
    expect(spoofedFed.tier).toBe(4);
  });

  it('never grants primary status to self-assignable or spoofed domains', () => {
    // An ir./investor. subdomain is publisher-controlled, not a recognised
    // official domain — it must stay at the unrated default.
    const ir = classifySource('Company Newsroom', 'https://investor.nvidia.com/news/x');
    expect(ir).toEqual({ tier: 4, label: null, primary: false, denied: false });

    // ".gov." appearing mid-hostname on an attacker-registered domain.
    const spoof = classifySource('Wire', 'https://sec.gov.uk.attacker-domain.com/press/1');
    expect(spoof.primary).toBe(false);
    expect(spoof.tier).toBe(4);
  });

  it('gives unknown publishers a neutral low default without a label', () => {
    const unknown = classifySource('Some Niche Herald', 'https://someniche.example/story');
    expect(unknown).toEqual({ tier: 4, label: null, primary: false, denied: false });
  });

  it('marks denylisted publishers as denied and known farms as low confidence', () => {
    expect(classifySource('Analytics Insight', 'https://analyticsinsight.net/x').denied).toBe(true);
    const fool = classifySource('The Motley Fool', 'https://fool.com/x');
    expect(fool).toMatchObject({ tier: 4, label: 'Low confidence', denied: false });
  });

  it('recognizes issuer newsrooms via stored official domains', () => {
    const officialDomains = ['nvidia.com'];
    const ir = classifySource(
      'NVIDIA Newsroom',
      'https://nvidianews.nvidia.com/news/q3-results',
      officialDomains
    );
    expect(ir).toMatchObject({ tier: 1, primary: true, label: 'Company announcement' });

    // Lookalike domains never match — suffix-anchored, not substring.
    const lookalike = classifySource(
      'NVIDIA Newsroom',
      'https://nvidia.com.attacker.net/fake',
      officialDomains
    );
    expect(lookalike.primary).toBe(false);
    expect(lookalike.tier).toBe(4);
  });

  it('labels press-release wires distinctly without primary status', () => {
    const wire = classifySource('Business Wire', 'https://www.businesswire.com/news/x');
    expect(wire).toMatchObject({ tier: 3, label: 'Press release', primary: false });
  });
});

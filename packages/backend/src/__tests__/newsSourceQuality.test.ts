import { describe, expect, it } from 'vitest';
import {
  classifySource,
  domainFromUrl,
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

    const ir = classifySource('Company Newsroom', 'https://investor.nvidia.com/news/x');
    expect(ir).toMatchObject({ tier: 1, primary: true });
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

  it('labels press-release wires distinctly without primary status', () => {
    const wire = classifySource('Business Wire', 'https://www.businesswire.com/news/x');
    expect(wire).toMatchObject({ tier: 3, label: 'Press release', primary: false });
  });
});

import { describe, expect, it } from 'vitest';
import {
  cleanPostText,
  extractCashtags,
  linksExternalSource,
  substanceLetters,
  truncateAtWord,
} from '../services/news/xPostText.js';

describe('cleanPostText', () => {
  it('decodes X escaping once, drops t.co links, and collapses whitespace', () => {
    expect(
      cleanPostText('HBM &amp; DRAM\n\nprices &gt; plan https://t.co/AbC123 &amp;lt;b&amp;gt;', 500)
    ).toBe('HBM & DRAM prices > plan &lt;b&gt;');
  });

  it('bounds length without splitting an emoji, even on hostile input', () => {
    expect(cleanPostText(`${'a'.repeat(9)}😀tail`, 10)).toBe('a'.repeat(9));
    expect(cleanPostText(`${'word '.repeat(400_000)}`, 4000)).toHaveLength(4000 - 1);
  });
});

describe('extractCashtags', () => {
  it("reads $TICKERs and X's symbol entities, never prices or oversized tokens", () => {
    expect(
      extractCashtags('Long $nvda and $BRK.B, short $5 calls; $EOS.AX up; $TOOLONGX; US$100', [
        { text: 'avgo' },
        { text: '12ab' },
      ])
    ).toEqual(['AVGO', 'NVDA', 'BRK.B', 'EOS.AX']);
  });

  it('reads a cashtag followed straight by a Korean or Japanese particle', () => {
    expect(extractCashtags('$MU는 강세, $NVDAの決算')).toEqual(['MU', 'NVDA']);
  });

  it('keeps at most 20 distinct tickers', () => {
    const letter = (n: number) => String.fromCharCode(65 + Math.floor(n));
    const tickers = Array.from({ length: 30 }, (_, i) => `$T${letter(i % 26)}${letter(i / 26)}`);
    expect(new Set(tickers).size).toBe(30);
    expect(extractCashtags(tickers.join(' '))).toHaveLength(20);
  });
});

describe('linksExternalSource', () => {
  it('counts only well-formed links that leave X', () => {
    expect(
      linksExternalSource([
        { expanded_url: 'https://x.com/fx_a/status/1' },
        { expanded_url: 'https://www.twitter.com/i/web/status/2' },
        { expanded_url: 'https://pic.x.com/abc' },
        { expanded_url: null },
      ])
    ).toBe(false);
    expect(linksExternalSource([{ expanded_url: 'javascript:alert(1)' }])).toBe(false);
    expect(linksExternalSource([{ expanded_url: 'not a url' }])).toBe(false);
    expect(
      linksExternalSource([{ expanded_url: 'https://www.thelec.kr/news/articleView.html?idxno=1' }])
    ).toBe(true);
  });
});

describe('substanceLetters', () => {
  it('ignores links, cashtags and mentions when measuring what a post says', () => {
    expect(substanceLetters('👀 $AVGO https://t.co/x')).toBe(0);
    expect(substanceLetters('@fx_anchor Got it')).toBe(5);
    expect(substanceLetters('Samsung HBM4 qualified')).toBe(19);
  });
});

describe('truncateAtWord', () => {
  it('leaves short text alone and cuts long text at a nearby word boundary', () => {
    expect(truncateAtWord('short', 10)).toBe('short');
    expect(truncateAtWord('alpha beta gamma delta', 15)).toBe('alpha beta…');
    expect(truncateAtWord('x'.repeat(20), 10)).toBe(`${'x'.repeat(9)}…`);
  });
});

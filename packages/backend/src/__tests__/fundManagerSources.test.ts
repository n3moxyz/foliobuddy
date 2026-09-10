import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchManagerNav,
  findFundManagerSource,
  FUND_MANAGER_SOURCES,
  parseAmovaNav,
  parseLionGlobalNav,
  parseNavDate,
  positiveNav,
} from '../services/providers/fundManagerSources.js';

const NOW = new Date('2026-09-10T12:00:00Z');
const amova = `<h1 class="sgfund-details-header__title">Amova Singapore Equity Fund - SGD Class</h1>
<span class="">SG9999004360</span> ISIN Number
<div class="">NAV</div><div class="">SGD 6.0462</div><div class="">as of 09 Sep 2026</div>`;
const lion =
  '<funds totalpage="1"><fund><f_code><![CDATA[LSSD]]></f_code><eng_lgi><![CDATA[LionGlobal Singapore Dividend Equity Fund Class SGD (Dec)]]></eng_lgi><currency><![CDATA[SGD]]></currency><nav>1.5930</nav><dealdate>2026-09-09</dealdate></fund></funds>';
const facts =
  '<facts><item><isin><![CDATA[SGXZ58947870]]></isin><currency><![CDATA[SGD]]></currency><valuation_frequency><![CDATA[Daily]]></valuation_frequency></item></facts>';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('official manager NAV contracts', () => {
  it('extracts the exact active Amova SGD class and LionGlobal Decumulation class', () => {
    expect(parseAmovaNav(amova, NOW)).toEqual({
      isin: 'SG9999004360',
      nativeCurrency: 'SGD',
      nativePrice: 6.0462,
      asOf: new Date('2026-09-09Z'),
    });
    expect(parseLionGlobalNav(lion, facts, NOW)).toEqual({
      isin: 'SGXZ58947870',
      nativeCurrency: 'SGD',
      nativePrice: 1.593,
      asOf: new Date('2026-09-09Z'),
    });
  });
  it.each([
    ['class', amova.replace('Fund - SGD Class', 'Fund - SGD Class A')],
    ['ISIN', amova.replace('SG9999004360', 'SG9999004361')],
    ['currency', amova.replace('SGD 6.', 'USD 6.')],
    ['missing quote', amova.replace('NAV</div>', 'Return</div>')],
    ['future', amova.replace('09 Sep', '11 Sep')],
    ['impossible', amova.replace('09 Sep', '31 Sep')],
    ['invalid number', amova.replace('6.0462', '6.04junk')],
  ])('rejects Amova %s mismatch', (_, html) => expect(() => parseAmovaNav(html, NOW)).toThrow());
  it.each([
    lion.replace('LSSD', 'LSDS'),
    lion.replace('SGD', 'USD'),
    lion.replace('1.5930', '0'),
    lion.replace('2026-09-09', '2026-02-30'),
    lion.replace('2026-09-09', '2026-09-11'),
    lion.replace('</fund>', ''),
    lion.replace('<nav>', '<nav><b>'),
    lion.replace('</nav>', '</nav><nav>2</nav>'),
  ])('rejects malformed/wrong-class LionGlobal response %#', (xml) =>
    expect(() => parseLionGlobalNav(xml, facts, NOW)).toThrow()
  );
  it('checks facts identity and daily frequency on every fetch', () => {
    expect(() =>
      parseLionGlobalNav(lion, facts.replace('SGXZ58947870', 'SGXZ00000000'), NOW)
    ).toThrow();
    expect(() => parseLionGlobalNav(lion, facts.replace('Daily', 'Monthly'), NOW)).toThrow();
  });
  it.each(['0', '-1', 'NaN', 'Infinity', '1e999', '1,234', '2x', ''])(
    'rejects nonpositive/nonfinite/malformed %s',
    (nav) => expect(() => positiveNav(nav)).toThrow()
  );
  it('validates calendar rollover and allows Singapore today at the UTC boundary', () => {
    expect(() => parseNavDate('2026-02-29', NOW)).toThrow();
    expect(() => parseNavDate('2026-09-11', new Date('2026-09-10T17:00:00Z'))).not.toThrow();
  });
  it('fetches fresh sources with bounded requests and rejects errors/unknown IDs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(lion))
      .mockResolvedValueOnce(new Response(facts));
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchManagerNav('SGXZ58947870')).nativePrice).toBe(1.593);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]).toEqual(
      expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) })
    );
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(fetchManagerNav('SG9999004360')).rejects.toThrow('503');
    await expect(fetchManagerNav('LSDS')).rejects.toThrow('Unsupported');
  });
});

describe('existing-record identity matching', () => {
  it('matches verified ISIN/currency and the exact known legacy Amova record', () => {
    expect(findFundManagerSource({ isin: 'SG9999004360', nativeCurrency: 'SGD' })?.manager).toBe(
      'Amova'
    );
    const legacy = FUND_MANAGER_SOURCES[0].legacy;
    const asset = {
      ...legacy,
      priceProvider: legacy.provider,
      nativeCurrency: 'SGD',
      category: 'UNIT_TRUST',
    };
    expect(findFundManagerSource(asset)?.isin).toBe('SG9999004360');
    expect(findFundManagerSource({ ...asset, id: 'another-record' })).toBeUndefined();
    expect(findFundManagerSource({ ...asset, isin: 'SG9999004361' })).toBeUndefined();
    expect(findFundManagerSource({ ...asset, nativeCurrency: 'USD' })).toBeUndefined();
    expect(findFundManagerSource({ ...asset, category: 'EQUITY' })).toBeUndefined();
  });
  it('accepts only the exact Yahoo Decumulation ticker without overriding a conflicting ISIN', () => {
    const asset = {
      priceProvider: 'yahoo',
      providerAssetId: '0P0001OPAN.SI',
      nativeCurrency: 'SGD',
    };
    expect(findFundManagerSource(asset)?.isin).toBe('SGXZ58947870');
    expect(findFundManagerSource({ ...asset, isin: 'SGXZ00000000' })).toBeUndefined();
  });
});

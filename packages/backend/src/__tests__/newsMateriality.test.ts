import { describe, expect, it } from 'vitest';
import { classifyMateriality } from '../services/news/materiality.js';

describe('classifyMateriality', () => {
  it.each([
    ['Nvidia beats estimates as Q3 revenue jumps 40%', 'earnings'],
    ['SEC approves spot Ethereum ETF applications', 'regulation'],
    ['Broadcom agrees to buy chip designer for $12 billion', 'mna'],
    ['MicroStrategy announces $2B convertible notes offering', 'financing'],
    ['TSMC wins major contract for next-gen AI accelerators', 'contract'],
    ['Bridge protocol hacked for $120M as attacker drains funds', 'security'],
    ['Kioxia CFO steps down unexpectedly', 'leadership'],
    ['Solana governance vote passes emissions cut proposal', 'tokenomics'],
    ['Bitcoin ETF inflows hit record $1.2B in a single day', 'flows'],
    ['Fed holds rates steady, signals two cuts this year', 'macro'],
    ['Morgan Stanley raises price target on Nvidia to $180', 'rating'],
  ])('classifies "%s" as high/%s', (title, eventType) => {
    expect(classifyMateriality(title)).toEqual({ importance: 'high', eventType });
  });

  it.each([
    ['Acme partners with CloudCo on enterprise pilot', 'partnership'],
    ['Apple unveils new AI features across product line', 'product'],
    ['Global NAND shipments rose 12% last quarter', 'industry'],
    ['Analysts say memory upcycle has further to run', 'rating'],
  ])('classifies "%s" as medium/%s', (title, eventType) => {
    expect(classifyMateriality(title)).toEqual({ importance: 'medium', eventType });
  });

  it('forces clickbait and speculation to low even when material topics appear', () => {
    expect(
      classifyMateriality('Bitcoin price prediction: could BTC reach $200K after ETF approval?')
    ).toEqual({
      importance: 'low',
      eventType: 'opinion',
    });
    expect(classifyMateriality("Here's why Nvidia stock is up today")).toEqual({
      importance: 'low',
      eventType: 'opinion',
    });
    expect(classifyMateriality('3 reasons to buy Solana before the halving')).toEqual({
      importance: 'low',
      eventType: 'opinion',
    });
  });

  it('defaults unmatched headlines to low/general', () => {
    expect(classifyMateriality('Bitcoin trades sideways in quiet weekend session')).toEqual({
      importance: 'low',
      eventType: 'general',
    });
  });

  it('does not mistake idioms and abbreviations for regulators or the Fed', () => {
    expect(
      classifyMateriality('Solana processes over 4,000 transactions per sec, new benchmark shows')
    ).toEqual({ importance: 'low', eventType: 'general' });
    expect(classifyMateriality('Investors fed up with delays in chip shipments')).toEqual({
      importance: 'medium',
      eventType: 'industry',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { mismatchedPickToast, resolvedAssetMatchesPick } from '../assetPickGuard';

describe('resolvedAssetMatchesPick', () => {
  it('rejects a picked stock that came back as a stablecoin (StablecoinX filed as Ethena USDe)', () => {
    expect(resolvedAssetMatchesPick({ category: 'STABLECOIN' }, 'EQUITY')).toBe(false);
  });

  it('rejects a picked coin or stablecoin that came back as a stock or unit trust', () => {
    expect(resolvedAssetMatchesPick({ category: 'EQUITY' }, 'STABLECOIN')).toBe(false);
    expect(resolvedAssetMatchesPick({ category: 'EQUITY' }, 'LIQUID_CRYPTO')).toBe(false);
    expect(resolvedAssetMatchesPick({ category: 'UNIT_TRUST' }, 'LIQUID_CRYPTO')).toBe(false);
  });

  it('rejects a picked stock that came back as a unit trust', () => {
    expect(resolvedAssetMatchesPick({ category: 'UNIT_TRUST' }, 'EQUITY')).toBe(false);
  });

  it('accepts the requested class', () => {
    expect(resolvedAssetMatchesPick({ category: 'EQUITY' }, 'EQUITY')).toBe(true);
    expect(resolvedAssetMatchesPick({ category: 'STABLECOIN' }, 'STABLECOIN')).toBe(true);
    expect(resolvedAssetMatchesPick({ category: 'NFT' }, 'LIQUID_CRYPTO')).toBe(true);
  });

  it('accepts a coin catalogued as crypto or cash either way, since it is the same coin', () => {
    expect(resolvedAssetMatchesPick({ category: 'STABLECOIN' }, 'LIQUID_CRYPTO')).toBe(true);
    expect(resolvedAssetMatchesPick({ category: 'LIQUID_CRYPTO' }, 'STABLECOIN')).toBe(true);
  });
});

describe('mismatchedPickToast', () => {
  it('names what was picked and what came back, in portfolio section terms', () => {
    expect(
      mismatchedPickToast('StablecoinX Inc.', { name: 'Ethena USDe', category: 'STABLECOIN' })
    ).toEqual({
      title: "Couldn't select StablecoinX Inc.",
      description:
        'The server returned Ethena USDe (Cash), a different asset, so nothing was selected. If this keeps happening, the server is mixing up assets that share a ticker.',
    });
  });

  it('labels a unit trust by the Equities section it appears in', () => {
    expect(
      mismatchedPickToast('Ethena USDe', { name: 'Amova Fund', category: 'UNIT_TRUST' }).description
    ).toContain('Amova Fund (Equities, unit trust)');
  });
});

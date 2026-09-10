import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NavStatus } from '../NavStatus';
import { displayedAssetPrice, localPriceLabel } from '../positionPriceDisplay';
import { usePrivacyStore } from '@/stores/privacyStore';
import type { Asset } from '@/lib/types';

const asset: Asset = {
  id: 'amova',
  symbol: 'AMOVASIN',
  name: 'Amova Singapore Equity',
  category: 'UNIT_TRUST',
  coingeckoId: null,
  priceProvider: 'fund-manager',
  providerAssetId: 'SG9999004360',
  nativeCurrency: 'SGD',
  exchange: null,
  factsheetUrl: null,
  isin: 'SG9999004360',
  currentPriceUsd: 6.0462 / 1.25,
  currentPriceNative: 6.0462,
  priceAsOf: '2026-09-09T00:00:00Z',
  priceUpdatedAt: '2026-09-10T12:00:00Z',
  priceCheckedAt: '2026-09-10T12:00:00Z',
  priceCheckStatus: 'ok',
  priceSource: 'fund-manager',
};
afterEach(() => {
  cleanup();
  usePrivacyStore.setState({ valuesHidden: false });
});

describe('daily NAV display', () => {
  it('renders the source valuation day, distinct check time, four decimals and exact class', () => {
    render(<NavStatus asset={asset} detailed />);
    expect(screen.getByText(/NAV as of 09 Sept? 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Last checked/)).toBeInTheDocument();
    expect(screen.getByText('Published NAV: S$6.0462')).toBeInTheDocument();
    expect(screen.getByText('ISIN SG9999004360')).toBeInTheDocument();
  });
  it('retains the actual date and shows failure without claiming a new quote', () => {
    render(<NavStatus asset={{ ...asset, priceCheckStatus: 'error' }} detailed />);
    expect(screen.getByText('Refresh failed · last known NAV')).toBeInTheDocument();
    expect(screen.getByText(/NAV as of 09 Sept? 2026/)).toBeInTheDocument();
  });
  it('does not use a legacy fetch time as the NAV date', () => {
    render(<NavStatus asset={{ ...asset, priceAsOf: null }} />);
    expect(screen.getByText('NAV date unavailable')).toBeInTheDocument();
  });
  it('keeps SGD NAV exact with newer client FX while exposing coherent stored USD', () => {
    expect(displayedAssetPrice(asset, 'SGD', 1.5)).toBe(6.0462);
    expect(displayedAssetPrice(asset, 'USD', 1.5)).toBe(6.0462 / 1.25);
    expect(
      localPriceLabel({
        usdPrice: asset.currentPriceUsd,
        nativePrice: asset.currentPriceNative,
        nativeCurrency: 'SGD',
        displayCurrency: 'USD',
        usdFxRates: { SGD: 1.5 },
      })
    ).toBe('(SGD 6.0462)');
  });
  it('respects monetary privacy for the official native quote', () => {
    usePrivacyStore.setState({ valuesHidden: true });
    render(<NavStatus asset={asset} detailed />);
    expect(screen.queryByText(/6\.0462/)).not.toBeInTheDocument();
    expect(screen.getByText(/NAV as of 09 Sept? 2026/)).toBeInTheDocument();
  });
});

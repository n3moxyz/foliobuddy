import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AssetLabel } from '../asset-label';

afterEach(cleanup);

describe('asset name subtext', () => {
  it('shows the verified full name below its ticker', () => {
    render(
      <AssetLabel asset={{ symbol: 'LIT', name: 'Lighter Protocol', category: 'LIQUID_CRYPTO' }} />
    );
    expect(screen.getByText('LIT')).toBeInTheDocument();
    expect(screen.getByText('Lighter Protocol')).toHaveAttribute('title', 'Lighter Protocol');
  });

  it('keeps the name line when the actual asset name equals its ticker', () => {
    const { container } = render(
      <AssetLabel
        asset={{ symbol: 'XRP', name: 'XRP', category: 'LIQUID_CRYPTO' }}
        alwaysShowName
      />
    );
    expect(container.querySelectorAll('p')).toHaveLength(2);
    expect(screen.getAllByText('XRP')).toHaveLength(2);
  });
});

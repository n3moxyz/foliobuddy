import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MASKED_MONEY_VALUE, usePrivacyStore } from '@/stores/privacyStore';
import { TradePnLPreview } from '../TradePnLPreview';

const inputs: ComponentProps<typeof TradePnLPreview> = {
  direction: 'LONG',
  entryPrice: '100',
  exitPrice: '125',
  quantity: '10',
  fundingCost: '20',
};

beforeEach(() => usePrivacyStore.setState({ valuesHidden: false }));

describe('TradePnLPreview', () => {
  it.each([
    { overrides: {}, amount: '+$230.00', percent: '+23.00%', color: 'text-profit' },
    {
      overrides: { direction: 'SHORT' as const, exitPrice: '80' },
      amount: '+$180.00',
      percent: '+18.00%',
      color: 'text-profit',
    },
    {
      overrides: { direction: 'SHORT' as const, exitPrice: '110', fundingCost: '' },
      amount: '-$100.00',
      percent: '-10.00%',
      color: 'text-loss',
    },
    {
      overrides: { entryPrice: '0.1', exitPrice: '0.12', quantity: '10', fundingCost: '0.3' },
      amount: '-$0.10',
      percent: '-10.00%',
      color: 'text-loss',
    },
    {
      overrides: { exitPrice: '100', fundingCost: '0' },
      amount: '$0.00',
      percent: '+0.00%',
      color: '',
    },
  ])('shows net $amount and $percent for $overrides', ({ overrides, amount, percent, color }) => {
    render(<TradePnLPreview {...inputs} {...overrides} />);

    const preview = within(screen.getByRole('status', { name: 'Trade P&L preview' }));
    const result = preview.getByText(amount);
    expect(preview.getByText(percent, { exact: false })).toBeInTheDocument();
    if (color) expect(result).toHaveClass(color);
    else expect(result).not.toHaveClass('text-profit', 'text-loss');
  });

  it.each([
    { entryPrice: '' },
    { exitPrice: '' },
    { exitPrice: '0' },
    { quantity: '0' },
    { fundingCost: '-1' },
    { quantity: 'NaN' },
    { quantity: 'Infinity' },
    { entryPrice: '1e308', quantity: '10' },
    { entryPrice: '1e-300', quantity: '1e-300' },
  ])('never shows a result for incomplete or unsafe inputs: %j', (overrides) => {
    render(<TradePnLPreview {...inputs} {...overrides} />);

    const preview = screen.getByRole('status', { name: 'Trade P&L preview' });
    expect(preview).toHaveTextContent('Net P&L: —');
    expect(preview).not.toHaveTextContent('$');
    expect(preview).not.toHaveTextContent(/NaN|Infinity/);
  });

  it('labels the compact net result without a separate funding breakdown', () => {
    render(<TradePnLPreview {...inputs} />);
    expect(screen.getByRole('status')).toHaveTextContent('Net P&L: +$230.00 +23.00%');
    expect(screen.queryByText('+$250.00')).not.toBeInTheDocument();
    expect(screen.queryByText('-$20.00')).not.toBeInTheDocument();
  });

  it('masks every money amount while keeping the net percentage visible', () => {
    usePrivacyStore.setState({ valuesHidden: true });
    render(<TradePnLPreview {...inputs} />);

    expect(screen.getAllByText(MASKED_MONEY_VALUE)).toHaveLength(1);
    expect(screen.getByText('+23.00%', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('status')).not.toHaveTextContent('$');
  });
});

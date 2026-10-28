import { useState, type ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PositionCostFields } from '../PositionCostFields';
import type { CostInputMode } from '../positionFormMath';

type Props = ComponentProps<typeof PositionCostFields>;

function props(overrides: Partial<Props> = {}): Props {
  return {
    costInputMode: 'total',
    onCostInputModeChange: vi.fn(),
    totalCost: '24233.86',
    calculatedTotalCost: '24233.860000000002',
    onTotalCostChange: vi.fn(),
    avgCostInput: '26.9265111111111',
    calculatedAvgCost: '26.9265111111111',
    onAvgCostChange: vi.fn(),
    costCurrency: 'SGD',
    ...overrides,
  };
}

describe('PositionCostFields derived displays', () => {
  it.each([
    ['SGD', '26.9265111111111', '26.93'],
    ['USD', '0.004321987', '0.00432'],
    ['USD', '0.0456789', '0.0457'],
    ['USD', '1.23456789', '1.235'],
    ['USD', '1800.543', '1,801'],
    ['JPY', '4400.987', '4,401'],
    ['KRW', '60000.987', '60,001'],
  ] as const)('formats the derived %s per-unit price %s as %s', (currency, value, expected) => {
    render(<PositionCostFields {...props({ costCurrency: currency, calculatedAvgCost: value })} />);
    const average = screen.getByLabelText(`Average Cost (${currency})`);
    expect(average).toBeDisabled();
    expect(average).toHaveValue(expected);
  });

  it.each([
    ['SGD', '1234567.8912345', '1,234,567.89'],
    ['USD', '0.004321987', '0.00'],
    ['JPY', '1234567.8912345', '1,234,568'],
    ['KRW', '1234567.8912345', '1,234,568'],
  ] as const)('formats the derived %s total %s as %s', (currency, value, expected) => {
    render(
      <PositionCostFields
        {...props({ costInputMode: 'avg', costCurrency: currency, calculatedTotalCost: value })}
      />
    );
    const total = screen.getByLabelText(`Total Cost (${currency})`);
    expect(total).toBeDisabled();
    expect(total).toHaveValue(expected);
  });

  it('keeps empty derived amounts empty instead of displaying a zero', () => {
    const { rerender } = render(<PositionCostFields {...props({ calculatedAvgCost: '' })} />);
    expect(screen.getByLabelText('Average Cost (SGD)')).toHaveValue('');
    rerender(<PositionCostFields {...props({ costInputMode: 'avg', calculatedTotalCost: '' })} />);
    expect(screen.getByLabelText('Total Cost (SGD)')).toHaveValue('');
  });

  it('keeps editable raw precision through changes and mode switches', () => {
    const onTotalChange = vi.fn();
    const onAverageChange = vi.fn();
    const onSubmit = vi.fn();
    function Harness() {
      const [mode, setMode] = useState<CostInputMode>('total');
      const [total, setTotal] = useState('24233.860000000002');
      const [average, setAverage] = useState('26.9265111111111');
      return (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ mode, total, average });
          }}
        >
          <PositionCostFields
            {...props({
              costInputMode: mode,
              onCostInputModeChange: setMode,
              totalCost: total,
              calculatedTotalCost: String(Number(average) * 900),
              onTotalCostChange: (value) => {
                setTotal(value);
                onTotalChange(value);
              },
              avgCostInput: average,
              calculatedAvgCost: String(Number(total) / 900),
              onAvgCostChange: (value) => {
                setAverage(value);
                onAverageChange(value);
              },
            })}
          />
          <button type="submit">Save</button>
        </form>
      );
    }

    render(<Harness />);
    expect(screen.getByLabelText('Total Cost (SGD)')).toHaveValue('24,233.860000000002');
    expect(screen.getByLabelText('Average Cost (SGD)')).toHaveValue('26.93');
    expect(onAverageChange).not.toHaveBeenCalled();
    expect(onTotalChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: 'Avg Cost' }));
    expect(screen.getByLabelText('Average Cost (SGD)')).toHaveValue('26.9265111111111');
    fireEvent.change(screen.getByLabelText('Average Cost (SGD)'), {
      target: { value: '0.0043219876500' },
    });
    expect(onAverageChange).toHaveBeenLastCalledWith('0.0043219876500');
    expect(screen.getByLabelText('Total Cost (SGD)')).toHaveValue('3.89');

    fireEvent.click(screen.getByRole('radio', { name: 'Total Cost' }));
    expect(screen.getByLabelText('Total Cost (SGD)')).toHaveValue('24,233.860000000002');
    fireEvent.change(screen.getByLabelText('Total Cost (SGD)'), {
      target: { value: '24,233.860000000009' },
    });
    expect(onTotalChange).toHaveBeenLastCalledWith('24233.860000000009');
    expect(screen.getByLabelText('Average Cost (SGD)')).toHaveValue('26.93');

    fireEvent.click(screen.getByRole('radio', { name: 'Avg Cost' }));
    expect(screen.getByLabelText('Average Cost (SGD)')).toHaveValue('0.0043219876500');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenLastCalledWith({
      mode: 'avg',
      total: '24233.860000000009',
      average: '0.0043219876500',
    });
    expect(onAverageChange).toHaveBeenCalledTimes(1);
    expect(onTotalChange).toHaveBeenCalledTimes(1);
  });

  it('preserves the selected raw field while saving disables all fields', () => {
    render(<PositionCostFields {...props({ disabled: true })} />);
    expect(screen.getByLabelText('Total Cost (SGD)')).toHaveValue('24,233.86');
    expect(screen.getByLabelText('Total Cost (SGD)')).toBeDisabled();
    expect(screen.getByLabelText('Average Cost (SGD)')).toHaveValue('26.93');
  });

  it('applies the same display rules to sale proceeds without changing their labels', () => {
    render(<PositionCostFields {...props({ variant: 'proceeds' })} />);
    expect(screen.getByLabelText('Total Proceeds (SGD)')).toHaveValue('24,233.86');
    expect(screen.getByLabelText('Avg Price (SGD)')).toHaveValue('26.93');
  });
});

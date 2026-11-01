import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CreatableSelect } from '../creatable-select';

beforeAll(() => {
  // Radix Select needs these browser APIs, which jsdom does not provide.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
});

function renderExchangeSelect() {
  return render(
    <CreatableSelect
      value="Binance"
      options={['Binance', 'Bybit']}
      placeholder="Select exchange"
      addLabel="+ Add new exchange"
      inputPlaceholder="Enter exchange name"
      inputLabel="New exchange name"
      adding={false}
      inputValue=""
      onValueChange={vi.fn()}
      onStartAdding={vi.fn()}
      onInputChange={vi.fn()}
      onAdd={vi.fn()}
      onCancel={vi.fn()}
      onEditOption={vi.fn()}
      onDeleteOption={vi.fn()}
    />
  );
}

describe('CreatableSelect removal verb', () => {
  it('calls removing a saved option "Remove" on both the keyboard and pointer controls', () => {
    renderExchangeSelect();

    // Keyboard control under the trigger. Only the option goes; positions keep the location.
    expect(screen.getByRole('button', { name: 'Remove Binance' })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });

    // Pointer control inside the open list uses the same verb.
    expect(screen.getByRole('button', { name: 'Remove Bybit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument();
  });
});

describe('CreatableSelect rename verb', () => {
  it('calls renaming a saved option "Rename" on both the keyboard and pointer controls', () => {
    renderExchangeSelect();

    // Keyboard control under the trigger.
    expect(screen.getByRole('button', { name: 'Rename Binance' })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });

    // The pencil inside the open list uses the same verb, never "Edit".
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rename Bybit' }));

    // The box it opens names the option being renamed.
    expect(screen.getByRole('textbox', { name: 'New name for Bybit' })).toHaveValue('Bybit');
  });
});

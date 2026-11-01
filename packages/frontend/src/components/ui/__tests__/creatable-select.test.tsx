import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CreatableSelect } from '../creatable-select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../dialog';

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

function renderSavedExchanges({
  value,
  options,
  onEditOption,
  onValueChange = vi.fn(),
}: {
  value: string;
  options: string[];
  onEditOption: (currentValue: string, nextValue: string) => string | null | void;
  onValueChange?: (value: string) => void;
}) {
  return render(
    <CreatableSelect
      value={value}
      options={options}
      placeholder="Select exchange"
      addLabel="+ Add new exchange"
      inputPlaceholder="Enter exchange name…"
      inputLabel="New exchange name"
      adding={false}
      inputValue=""
      onValueChange={onValueChange}
      onStartAdding={vi.fn()}
      onInputChange={vi.fn()}
      onAdd={vi.fn()}
      onCancel={vi.fn()}
      onEditOption={onEditOption}
      onDeleteOption={vi.fn()}
      isOptionEditable={(option) => option !== 'Binance'}
    />
  );
}

describe('CreatableSelect rename collisions', () => {
  it('renames in place when only the capitals change', () => {
    const onEditOption = vi.fn((_currentValue: string, nextValue: string) => nextValue);
    const onValueChange = vi.fn();
    renderSavedExchanges({
      value: 'kraken',
      options: ['Binance', 'kraken'],
      onEditOption,
      onValueChange,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Rename kraken' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New name for kraken' }), {
      target: { value: 'Kraken' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onEditOption).toHaveBeenCalledWith('kraken', 'Kraken');
    expect(onValueChange).toHaveBeenCalledWith('Kraken');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'New name for kraken' })).not.toBeInTheDocument();
  });

  it('refuses a name already in the list, built-in or saved, and says why', () => {
    const onEditOption = vi.fn();
    renderSavedExchanges({ value: 'OKX', options: ['Binance', 'Kraken', 'OKX'], onEditOption });

    fireEvent.click(screen.getByRole('button', { name: 'Rename OKX' }));
    const renameBox = screen.getByRole('textbox', { name: 'New name for OKX' });

    fireEvent.change(renameBox, { target: { value: 'binance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const builtInMessage = "Couldn't rename OKX. Binance is already in the list.";
    expect(screen.getByRole('alert')).toHaveTextContent(builtInMessage);
    expect(renameBox).toHaveAttribute('aria-invalid', 'true');
    expect(renameBox).toHaveAccessibleDescription(builtInMessage);
    // In a phone-height dialog the message can land below the edge, so it scrolls into view.
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts).toContain(
      screen.getByRole('alert')
    );

    // Editing the name clears the message until the next save.
    fireEvent.change(renameBox, { target: { value: ' KRAKEN ' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(renameBox).not.toHaveAttribute('aria-invalid');

    fireEvent.keyDown(renameBox, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't rename OKX. Kraken is already in the list."
    );

    // Nothing merged: the box keeps the typed name so it can be corrected.
    expect(onEditOption).not.toHaveBeenCalled();
    expect(renameBox).toHaveValue(' KRAKEN ');
  });
});

function ExchangeFieldInDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState('Kraken');
  const [adding, setAdding] = useState(false);
  const [inputValue, setInputValue] = useState('');

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        setOpen(nextOpen);
      }}
    >
      <DialogContent>
        <DialogTitle>Add Position</DialogTitle>
        <DialogDescription>Choose where the position is held.</DialogDescription>
        <CreatableSelect
          value={value}
          options={['Binance', 'Kraken']}
          placeholder="Select exchange"
          addLabel="+ Add new exchange"
          inputPlaceholder="Enter exchange name…"
          inputLabel="New exchange name"
          adding={adding}
          inputValue={inputValue}
          onValueChange={(nextValue) => {
            if (nextValue) setValue(nextValue);
          }}
          onStartAdding={() => setAdding(true)}
          onInputChange={setInputValue}
          onAdd={() => null}
          onCancel={() => {
            setAdding(false);
            setInputValue('');
          }}
          onEditOption={(_currentValue, nextValue) => nextValue}
          onDeleteOption={() => true}
          isOptionEditable={(option) => option === 'Kraken'}
        />
      </DialogContent>
    </Dialog>
  );
}

describe('CreatableSelect Escape inside a dialog', () => {
  it('cancels only the rename, then returns focus to the field', async () => {
    const onOpenChange = vi.fn();
    render(<ExchangeFieldInDialog onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Rename Kraken' }));
    const renameBox = screen.getByRole('textbox', { name: 'New name for Kraken' });
    await waitFor(() => expect(renameBox).toHaveFocus());
    fireEvent.change(renameBox, { target: { value: 'Kraken Pro' } });

    fireEvent.keyDown(renameBox, { key: 'Escape' });

    expect(screen.queryByRole('textbox', { name: /New name for/ })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    const field = screen.getByRole('combobox');
    expect(field).toHaveTextContent('Kraken');
    expect(field).toHaveFocus();

    // With the rename gone, Escape closes the dialog as usual.
    fireEvent.keyDown(field, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('puts focus in a rename box opened from the list, so Escape reaches it', async () => {
    const onOpenChange = vi.fn();
    render(<ExchangeFieldInDialog onOpenChange={onOpenChange} />);

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: 'Rename Kraken' }));
    const renameBox = screen.getByRole('textbox', { name: 'New name for Kraken' });
    // The closing list would hand focus back to the field; the box keeps it.
    await waitFor(() => expect(renameBox).toHaveFocus());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(renameBox).toHaveFocus();

    fireEvent.keyDown(renameBox, { key: 'Escape' });

    expect(screen.queryByRole('textbox', { name: /New name for/ })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('cancels only the rename when Escape is pressed on its buttons', () => {
    const onOpenChange = vi.fn();
    render(<ExchangeFieldInDialog onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Rename Kraken' }));
    const save = screen.getByRole('button', { name: 'Save' });
    save.focus();

    fireEvent.keyDown(save, { key: 'Escape' });

    expect(screen.queryByRole('textbox', { name: /New name for/ })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('cancels only the new name in the add box', async () => {
    const onOpenChange = vi.fn();
    render(<ExchangeFieldInDialog onOpenChange={onOpenChange} />);

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: '+ Add new exchange' }));
    const addBox = screen.getByRole('textbox', { name: 'New exchange name' });
    await waitFor(() => expect(addBox).toHaveFocus());
    fireEvent.change(addBox, { target: { value: 'OKX' } });

    fireEvent.keyDown(addBox, { key: 'Escape' });

    expect(screen.queryByRole('textbox', { name: 'New exchange name' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toHaveFocus();
  });
});

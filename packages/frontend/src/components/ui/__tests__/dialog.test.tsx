import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../dialog';

function ControlledDialog() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Add holding</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Add holding</DialogTitle>
          <DialogDescription>Choose an asset.</DialogDescription>
          <input
            aria-label="Asset"
            role="combobox"
            aria-expanded={expanded}
            aria-controls={expanded ? 'test-assets' : undefined}
            onFocus={() => setExpanded(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && expanded) {
                event.preventDefault();
                setExpanded(false);
              }
            }}
          />
          {expanded && (
            <div id="test-assets" role="listbox" aria-label="Assets">
              <div role="option" aria-selected="false">
                Bitcoin
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

describe('controlled dialog keyboard recovery', () => {
  it('closes the search popup before closing its dialog, then restores the opener', async () => {
    render(<ControlledDialog />);
    const opener = screen.getByRole('button', { name: 'Add holding' });
    opener.focus();
    fireEvent.click(opener);
    const input = await screen.findByRole('combobox');
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { HelpTooltip } from '../HelpTooltip';

// Radix Popper measures with ResizeObserver, which jsdom doesn't implement.
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('HelpTooltip', () => {
  it('renders its popup outside the trigger ancestors so it cannot inherit their styles', () => {
    // NetWorthCard's label row is whitespace-nowrap. A popup rendered inside it
    // inherits that, stays on one line and is clipped at max-w-[240px], so
    // TooltipContent portals to <body> instead.
    const { container } = render(
      <div className="whitespace-nowrap">
        <HelpTooltip label="MDD" content="Largest peak-to-trough decline since January 1" />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Help: MDD' }));

    const popup = screen.getByRole('tooltip').parentElement;
    expect(popup).toHaveClass('max-w-[240px]');
    expect(container).not.toContainElement(popup);
  });

  it('opens on the first tap when the browser focuses the button before the click', () => {
    render(<HelpTooltip label="MDD" content="Largest peak-to-trough decline this year." />);
    const button = screen.getByRole('button', { name: 'Help: MDD' });

    // Android Chrome: the finger lifts, the button takes focus (Radix opens on focus), then the
    // click arrives. The click must not flip the tooltip closed again.
    fireEvent.pointerDown(button, { pointerType: 'touch' });
    fireEvent.pointerUp(button, { pointerType: 'touch' });
    fireEvent.focus(button);
    fireEvent.click(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Largest peak-to-trough decline this year.'
    );

    // A second tap closes it.
    fireEvent.pointerDown(button, { pointerType: 'touch' });
    fireEvent.pointerUp(button, { pointerType: 'touch' });
    fireEvent.click(button);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('keeps the definition open when a mouse clicks it', () => {
    render(<HelpTooltip label="MDD" content="Largest peak-to-trough decline this year." />);
    const button = screen.getByRole('button', { name: 'Help: MDD' });

    for (let i = 0; i < 2; i++) {
      fireEvent.pointerDown(button, { pointerType: 'mouse' });
      fireEvent.pointerUp(button, { pointerType: 'mouse' });
      fireEvent.click(button);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    }
  });

  it('opens on keyboard focus and toggles with Enter', () => {
    render(<HelpTooltip label="MDD" content="Largest peak-to-trough decline this year." />);
    const button = screen.getByRole('button', { name: 'Help: MDD' });

    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    // Enter and Space fire a click with no press before it.
    fireEvent.click(button);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });
});

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
  it('wraps its text even under a whitespace-nowrap ancestor', () => {
    // The popup isn't portaled, so it inherits text styles from wherever the
    // trigger sits. NetWorthCard's label row is whitespace-nowrap: without the
    // reset the text stays on one line and is clipped at max-w-[240px].
    render(
      <div className="whitespace-nowrap">
        <HelpTooltip label="MDD" content="Largest peak-to-trough decline since January 1" />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Help: MDD' }));

    const popup = screen.getByRole('tooltip').parentElement;
    expect(popup).toHaveClass('max-w-[240px]', 'whitespace-normal');
  });
});

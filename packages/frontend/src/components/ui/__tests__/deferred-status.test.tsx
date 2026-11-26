import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFERRED_STATUS_DELAY_MS, DeferredStatus } from '../deferred-status';

describe('DeferredStatus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('mounts an empty live region, then fills in its text', () => {
    render(<DeferredStatus>Loading trades…</DeferredStatus>);
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();

    act(() => vi.advanceTimersByTime(DEFERRED_STATUS_DELAY_MS));
    expect(region).toHaveTextContent('Loading trades…');
  });

  it('announces nothing for a load that ends within the delay', () => {
    const { unmount } = render(<DeferredStatus>Loading trades…</DeferredStatus>);
    unmount();
    expect(() => act(() => vi.advanceTimersByTime(DEFERRED_STATUS_DELAY_MS))).not.toThrow();
  });
});

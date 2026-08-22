import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useThemeStore } from '@/stores/themeStore';
import { installMatchMedia } from '@/test/matchMedia';
import { AppToaster, MOBILE_SHEET_QUERY, MOBILE_TOP_OFFSET_PX } from '../AppToaster';

const { toasterSpy } = vi.hoisted(() => ({ toasterSpy: vi.fn() }));

vi.mock('sonner', () => ({
  Toaster: (props: Record<string, unknown>) => {
    toasterSpy(props);
    return <div data-testid="toaster" />;
  },
}));

vi.mock('@radix-ui/react-dismissable-layer', () => ({
  DismissableLayerBranch: ({ children }: { children: ReactNode }) => (
    <div data-testid="dismissable-branch">{children}</div>
  ),
}));

function lastToasterProps() {
  return toasterSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

describe('AppToaster', () => {
  let media: ReturnType<typeof installMatchMedia>;

  beforeEach(() => {
    toasterSpy.mockClear();
    media = installMatchMedia(false);
    useThemeStore.setState({ theme: 'dark' });
  });

  afterEach(() => {
    media.uninstall();
  });

  it('renders the toaster inside a Radix DismissableLayerBranch', () => {
    render(<AppToaster />);
    const branch = screen.getByTestId('dismissable-branch');
    expect(branch).toContainElement(screen.getByTestId('toaster'));
  });

  it('passes the raw theme preference through, including system', () => {
    useThemeStore.setState({ theme: 'system' });
    render(<AppToaster />);
    expect(lastToasterProps().theme).toBe('system');

    act(() => useThemeStore.setState({ theme: 'light' }));
    expect(lastToasterProps().theme).toBe('light');
  });

  it('keeps toasts interactive under Radix modals and uses rich colors + close button', () => {
    render(<AppToaster />);
    const props = lastToasterProps();
    expect(props.className).toBe('pointer-events-auto');
    expect(props.closeButton).toBe(true);
    expect(props.richColors).toBe(true);
  });

  it('anchors bottom-right on desktop and top-center in the bottom-sheet layout', () => {
    render(<AppToaster />);
    expect(media.matchMedia).toHaveBeenCalledWith(MOBILE_SHEET_QUERY);
    expect(lastToasterProps().position).toBe('bottom-right');

    act(() => media.setMatches(true));
    expect(lastToasterProps().position).toBe('top-center');
    expect(lastToasterProps().mobileOffset).toEqual({ top: MOBILE_TOP_OFFSET_PX });
    expect(lastToasterProps().offset).toEqual({ top: MOBILE_TOP_OFFSET_PX });

    act(() => media.setMatches(false));
    expect(lastToasterProps().position).toBe('bottom-right');
  });
});

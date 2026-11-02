import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnimatedNumbers } from '@/hooks/useAnimatedNumber';
import { installMatchMedia } from '@/test/matchMedia';

type Props = { targets: Array<number | null | undefined>; view?: string };

describe('useAnimatedNumbers', () => {
  let media: ReturnType<typeof installMatchMedia>;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let now: number;

  beforeEach(() => {
    media = installMatchMedia(false);
    frames = new Map();
    nextFrame = 0;
    now = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    media.uninstall();
  });

  const advance = (ms: number) =>
    act(() => {
      now += ms;
      const due = [...frames.values()];
      frames.clear();
      due.forEach((callback) => callback(now));
    });

  const renderNumbers = (initialProps: Props) =>
    renderHook(({ targets, view }: Props) => useAnimatedNumbers(targets, 600, view), {
      initialProps,
    });

  it('ticks a value already on screen from its old figure to the new one', () => {
    const { result, rerender } = renderNumbers({ targets: [100] });

    rerender({ targets: [200] });
    expect(result.current).toEqual([100]);

    advance(300);
    expect(result.current[0]).toBeGreaterThan(100);
    expect(result.current[0]).toBeLessThan(200);

    advance(300);
    expect(result.current).toEqual([200]);
  });

  it('shows a value that arrives after loading at once, never counting up from 0', () => {
    const { result, rerender } = renderNumbers({ targets: [100, undefined] });
    expect(result.current).toEqual([100, 0]);

    rerender({ targets: [100, 500] });
    expect(result.current).toEqual([100, 500]);

    advance(16);
    expect(result.current).toEqual([100, 500]);
  });

  it('shows the new figures at once when the view changes', () => {
    const { result, rerender } = renderNumbers({ targets: [100], view: 'USD:1' });

    rerender({ targets: [134], view: 'SGD:1' });
    expect(result.current).toEqual([134]);

    advance(16);
    expect(result.current).toEqual([134]);
  });
});

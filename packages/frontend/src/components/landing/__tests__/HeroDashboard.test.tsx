import { Profiler } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroDashboard } from '../HeroDashboard';

type ChangeListener = () => void;

describe('HeroDashboard pointer tilt', () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  let now: number;
  let reduced: boolean;
  let reducedListeners: Set<ChangeListener>;

  beforeEach(() => {
    frames = new Map();
    nextFrame = 0;
    now = 0;
    reduced = false;
    reducedListeners = new Set();
    // A desktop with a mouse: the hover query matches, reduced motion starts off.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn((query: string) => ({
        media: query,
        get matches() {
          return query.includes('reduced-motion') ? reduced : query.includes('hover');
        },
        addEventListener: (_type: 'change', listener: ChangeListener) => {
          if (query.includes('reduced-motion')) reducedListeners.add(listener);
        },
        removeEventListener: (_type: 'change', listener: ChangeListener) => {
          reducedListeners.delete(listener);
        },
      })),
    });
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
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  const runFrames = (count: number) => {
    for (let i = 0; i < count && frames.size > 0; i++) {
      act(() => {
        now += 16;
        const due = [...frames.values()];
        frames.clear();
        due.forEach((callback) => callback(now));
      });
    }
  };

  const renderHero = () => {
    const onRender = vi.fn();
    const { container } = render(
      <Profiler id="hero" onRender={onRender}>
        <HeroDashboard />
      </Profiler>
    );
    // Let the entrance and the net worth count-up finish, so only the tilt is left.
    runFrames(500);
    onRender.mockClear();

    const stage = container.firstElementChild as HTMLElement;
    const panel = stage.firstElementChild as HTMLElement;
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 100 })
    );
    return { onRender, stage, panel };
  };

  const rotateY = (panel: HTMLElement) =>
    Number(/rotateY\((-?\d+(?:\.\d+)?)deg\)/.exec(panel.style.transform)?.[1] ?? NaN);

  it('tilts toward the pointer without re-rendering the hero', () => {
    const { onRender, stage, panel } = renderHero();

    fireEvent.pointerMove(stage, { clientX: 200, clientY: 50 });
    runFrames(10);

    expect(rotateY(panel)).toBeGreaterThan(0);
    expect(onRender).not.toHaveBeenCalled();
  });

  it('levels the panel when reduced motion turns on mid-tilt', () => {
    const { stage, panel } = renderHero();
    fireEvent.pointerMove(stage, { clientX: 200, clientY: 50 });
    runFrames(10);
    expect(rotateY(panel)).toBeGreaterThan(0);

    act(() => {
      reduced = true;
      reducedListeners.forEach((listener) => listener());
    });

    expect(panel.style.transform).not.toMatch(/rotate/);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme } from '@/stores/themeStore';

const GUARD = '*,*::before,*::after{transition:none!important}';
const guards = () =>
  [...document.head.querySelectorAll('style')].filter((style) => style.textContent === GUARD);

describe('applyTheme', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.classList.remove('dark');
    guards().forEach((style) => style.remove());
  });

  it('turns transitions off for the swap and back on once a frame has painted', () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    applyTheme('dark');

    expect(document.documentElement).toHaveClass('dark');
    expect(guards()).toHaveLength(1);
    frames.shift()!(0);
    expect(guards()).toHaveLength(1);
    frames.shift()!(16);
    expect(guards()).toHaveLength(0);
  });

  it('leaves transitions alone when that theme is already showing', () => {
    document.documentElement.classList.add('dark');

    applyTheme('dark');

    expect(guards()).toHaveLength(0);
  });
});

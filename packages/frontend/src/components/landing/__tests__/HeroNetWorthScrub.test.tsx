import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroNetWorthScrub } from '../HeroNetWorthScrub';
import { HERO_LAST, HERO_MDD, HERO_TROUGH, HERO_VALUES, heroReadout } from '../heroScrubData';
import { SCROLL_MILESTONES } from '../landingData';

describe('hero scrub data', () => {
  it('quotes the same drawdown as the scroll story', () => {
    const drawdownCopy = SCROLL_MILESTONES.find((m) => m.id === 'drawdown')?.title ?? '';
    expect(drawdownCopy).toContain(`${(Math.abs(HERO_MDD) * 100).toFixed(1)}%`);
    expect(heroReadout(HERO_TROUGH)).toMatchObject({
      label: 'Mar · Max drawdown',
      badge: '−9.6% MDD',
      tone: 'danger',
    });
  });

  it('ends the year on its all-time high, at the return the copy quotes', () => {
    expect(Math.max(...HERO_VALUES)).toBe(HERO_VALUES[HERO_LAST]);
    expect(heroReadout(HERO_LAST).label).toBe('Aug · All-time high');
    expect(heroReadout(null)).toEqual({
      label: 'Net Worth',
      value: '$487,200',
      badge: '+18.4%',
      tone: 'success',
    });
  });

  it('reads an ordinary point as its month and the change since the start', () => {
    const readout = heroReadout(Math.round(HERO_LAST * 0.24));
    expect(readout.label).toBe('Nov');
    expect(readout.badge).toMatch(/^\+\d+\.\d%$/);
  });
});

describe('HeroNetWorthScrub', () => {
  beforeEach(() => {
    // jsdom has no layout observers; the stage only needs them to exist.
    class Observer {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', Observer);
    vi.stubGlobal('IntersectionObserver', Observer);
    // Reduced motion: the stage shows its poster, the drawdown beat, as a still.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn((query: string) => ({
        media: query,
        matches: query.includes('reduced-motion'),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('is hidden from assistive tech and shows the drawdown poster', () => {
    const { container } = render(<HeroNetWorthScrub />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root.textContent).toContain('Max drawdown');
    expect(root.textContent).toContain('MDD');
  });
});

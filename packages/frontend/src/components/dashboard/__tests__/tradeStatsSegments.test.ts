import type { Active, Over, UniqueIdentifier } from '@dnd-kit/core';
import { describe, expect, it, vi } from 'vitest';
import type { SegmentId } from '@/stores/tradeStatsStore';
import {
  SEGMENT_LABELS,
  segmentAnnouncements,
  segmentKeyboardCoordinates,
} from '../tradeStatsSegments';

const ORDER: SegmentId[] = ['metrics', 'winRate', 'avgWinLoss', 'byDirection', 'notableTrades'];
const active = (id: SegmentId) => ({ id }) as unknown as Active;
const over = (id: SegmentId) => ({ id }) as unknown as Over;

// Phone layout: Key Metrics stacks its four metrics into one tall column.
const HEIGHTS: Record<SegmentId, number> = {
  metrics: 285,
  winRate: 87,
  avgWinLoss: 89,
  byDirection: 150,
  notableTrades: 120,
};

function layout() {
  const rects = new Map<UniqueIdentifier, { top: number; height: number; left: number }>();
  let top = 100;
  for (const id of ORDER) {
    rects.set(id, { top, height: HEIGHTS[id], left: 16 });
    top += HEIGHTS[id] + 20;
  }
  return rects;
}

// Steps one key press the way dnd-kit's KeyboardSensor would, returning the new top of the
// dragged section, or undefined when it does not move.
function step(code: string, activeId: SegmentId, overId: SegmentId, collisionTop: number) {
  const rects = layout();
  const event = { code, preventDefault: vi.fn() } as unknown as KeyboardEvent;
  const context = {
    active: { id: activeId },
    over: { id: overId },
    collisionRect: { left: 16, top: collisionTop, height: HEIGHTS[activeId], width: 300 },
    droppableRects: rects,
    droppableContainers: { getEnabled: () => ORDER.map((id) => ({ id })) },
  };
  const result = segmentKeyboardCoordinates(event, {
    active: activeId,
    currentCoordinates: { x: 16, y: collisionTop },
    context,
  } as unknown as Parameters<typeof segmentKeyboardCoordinates>[1]);
  return { result, event, rects };
}

describe('Trade Analytics keyboard reordering', () => {
  it('centres a tall section on the next section, so it never stalls', () => {
    const { result, rects } = step('ArrowDown', 'metrics', 'metrics', 100);
    const winRate = rects.get('winRate')!;
    expect(result).toEqual({ x: 16, y: winRate.top + winRate.height / 2 - HEIGHTS.metrics / 2 });

    // Already over Win Rate, the next Down goes to Avg Win vs Avg Loss, not back to Win Rate.
    const next = step('ArrowDown', 'metrics', 'winRate', 0);
    const avgWinLoss = next.rects.get('avgWinLoss')!;
    expect(next.result).toEqual({
      x: 16,
      y: avgWinLoss.top + avgWinLoss.height / 2 - HEIGHTS.metrics / 2,
    });
  });

  it('moves up, and stops at either end', () => {
    const up = step('ArrowUp', 'winRate', 'winRate', 405);
    const metrics = up.rects.get('metrics')!;
    expect(up.result).toEqual({ x: 16, y: metrics.top + metrics.height / 2 - HEIGHTS.winRate / 2 });

    expect(step('ArrowUp', 'metrics', 'metrics', 100).result).toBeUndefined();
    expect(step('ArrowDown', 'notableTrades', 'notableTrades', 900).result).toBeUndefined();
  });

  it('keeps Left and Right from scrolling the page and does not move the section', () => {
    const { result, event } = step('ArrowRight', 'winRate', 'winRate', 405);
    expect(result).toBeUndefined();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(step('Tab', 'winRate', 'winRate', 405).event.preventDefault).not.toHaveBeenCalled();
  });
});

describe('Trade Analytics segment announcements', () => {
  it('names the section and its position, and keeps the pick-up message', () => {
    const pickedUp: { current: UniqueIdentifier | null } = { current: null };
    const announce = segmentAnnouncements(ORDER, pickedUp);

    expect(announce.onDragStart({ active: active('winRate') })).toBe(
      'Picked up the Win Rate section. It is in position 2 of 5.'
    );
    // dnd-kit reports the section over itself straight after pick-up: stay quiet.
    expect(
      announce.onDragOver({ active: active('winRate'), over: over('winRate') })
    ).toBeUndefined();
    expect(announce.onDragOver({ active: active('winRate'), over: over('avgWinLoss') })).toBe(
      'Win Rate section moved to position 3 of 5.'
    );
    // Moving back to where it started is announced.
    expect(announce.onDragOver({ active: active('winRate'), over: over('winRate') })).toBe(
      'Win Rate section moved to position 2 of 5.'
    );
    expect(announce.onDragEnd({ active: active('winRate'), over: over('avgWinLoss') })).toBe(
      'Win Rate section dropped in position 3 of 5.'
    );
  });

  it('says where a cancelled move returns, and handles a drop outside the list', () => {
    const announce = segmentAnnouncements(ORDER, { current: null });

    expect(announce.onDragCancel({ active: active('notableTrades'), over: null })).toBe(
      'Move cancelled. Notable Trades section returned to position 5 of 5.'
    );
    expect(announce.onDragEnd({ active: active('metrics'), over: null })).toBe(
      'Key Metrics section dropped.'
    );
    expect(announce.onDragOver({ active: active('metrics'), over: null })).toBeUndefined();
  });

  it('gives every saved segment ID a readable name', () => {
    for (const id of ORDER) {
      expect(SEGMENT_LABELS[id]).not.toBe(id);
      expect(SEGMENT_LABELS[id]).toMatch(/^[A-Z][A-Za-z ]+$/);
    }
  });
});

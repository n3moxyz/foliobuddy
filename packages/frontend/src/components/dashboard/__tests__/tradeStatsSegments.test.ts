import type { Active, Over, UniqueIdentifier } from '@dnd-kit/core';
import { describe, expect, it } from 'vitest';
import type { SegmentId } from '@/stores/tradeStatsStore';
import { SEGMENT_LABELS, segmentAnnouncements } from '../tradeStatsSegments';

const ORDER: SegmentId[] = ['metrics', 'winRate', 'avgWinLoss', 'byDirection', 'notableTrades'];
const active = (id: SegmentId) => ({ id }) as unknown as Active;
const over = (id: SegmentId) => ({ id }) as unknown as Over;

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

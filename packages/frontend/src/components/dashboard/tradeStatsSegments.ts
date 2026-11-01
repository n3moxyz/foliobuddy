import {
  KeyboardCode,
  type Announcements,
  type KeyboardCoordinateGetter,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import type { SegmentId } from '@/stores/tradeStatsStore';

// Segment IDs are saved in browser storage (trade-stats-order), so they never change. Screen
// readers hear these names instead of the IDs.
export const SEGMENT_LABELS: Record<SegmentId, string> = {
  metrics: 'Key Metrics',
  winRate: 'Win Rate',
  avgWinLoss: 'Avg Win vs Avg Loss',
  byDirection: 'By Direction',
  notableTrades: 'Notable Trades',
};

export function segmentLabel(id: UniqueIdentifier): string {
  return SEGMENT_LABELS[id as SegmentId] ?? String(id);
}

export const SEGMENT_SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    'To pick up this section, press Space or Enter. Use the up and down arrow keys to move it, then press Space or Enter to drop it. Press Escape to cancel.',
};

const ARROW_KEYS: string[] = [
  KeyboardCode.Down,
  KeyboardCode.Up,
  KeyboardCode.Left,
  KeyboardCode.Right,
];

/**
 * Up and Down step to the next or previous section and centre the dragged one on it, so
 * closestCenter always lands there. dnd-kit's sortable getter lines edges up instead, which
 * stalls a tall section (Key Metrics stacks to one column on phones) after one step.
 * Left and Right do nothing: the sections form one column.
 */
export const segmentKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  if (!ARROW_KEYS.includes(event.code)) return undefined;
  event.preventDefault();
  if (event.code !== KeyboardCode.Down && event.code !== KeyboardCode.Up) return undefined;

  const { active, over, collisionRect, droppableRects, droppableContainers } = context;
  if (!active || !collisionRect) return undefined;

  const sections = droppableContainers
    .getEnabled()
    .flatMap((container) => {
      const rect = droppableRects.get(container.id);
      return rect ? [{ id: container.id, rect }] : [];
    })
    .sort((a, b) => a.rect.top - b.rect.top);
  const current = sections.findIndex((section) => section.id === (over?.id ?? active.id));
  if (current === -1) return undefined;
  const target = sections[current + (event.code === KeyboardCode.Down ? 1 : -1)];
  if (!target) return undefined;

  return {
    x: collisionRect.left,
    y: target.rect.top + target.rect.height / 2 - collisionRect.height / 2,
  };
};

/**
 * Drag announcements that name sections and positions. `pickedUp` remembers the section just
 * picked up: dnd-kit reports it over itself straight away, and announcing that would replace
 * "Picked up…" before a screen reader reads it.
 */
export function segmentAnnouncements(
  order: SegmentId[],
  pickedUp: { current: UniqueIdentifier | null }
): Announcements {
  const position = (id: UniqueIdentifier) =>
    `position ${order.indexOf(id as SegmentId) + 1} of ${order.length}`;
  return {
    onDragStart: ({ active }) => {
      pickedUp.current = active.id;
      return `Picked up the ${segmentLabel(active.id)} section. It is in ${position(active.id)}.`;
    },
    onDragOver: ({ active, over }) => {
      const justPickedUp = pickedUp.current === active.id;
      pickedUp.current = null;
      if (!over || (justPickedUp && over.id === active.id)) return undefined;
      return `${segmentLabel(active.id)} section moved to ${position(over.id)}.`;
    },
    onDragEnd: ({ active, over }) => {
      pickedUp.current = null;
      return over
        ? `${segmentLabel(active.id)} section dropped in ${position(over.id)}.`
        : `${segmentLabel(active.id)} section dropped.`;
    },
    onDragCancel: ({ active }) => {
      pickedUp.current = null;
      return `Move cancelled. ${segmentLabel(active.id)} section returned to ${position(active.id)}.`;
    },
  };
}

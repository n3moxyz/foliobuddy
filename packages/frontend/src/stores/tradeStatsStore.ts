import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SegmentId = 'metrics' | 'winRate' | 'avgWinLoss' | 'byDirection' | 'notableTrades';

const DEFAULT_ORDER: SegmentId[] = ['metrics', 'winRate', 'avgWinLoss', 'byDirection', 'notableTrades'];

interface TradeStatsState {
  segmentOrder: SegmentId[];
  setOrder: (order: SegmentId[]) => void;
}

export const useTradeStatsStore = create<TradeStatsState>()(
  persist(
    (set) => ({
      segmentOrder: DEFAULT_ORDER,
      setOrder: (order) => set({ segmentOrder: order }),
    }),
    {
      name: 'trade-stats-order',
    }
  )
);

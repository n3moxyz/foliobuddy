import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { TRADE_SORT_OPTIONS, isTradeSortOrder } from '@/lib/tradeSort';
import { useTradeSortStore } from '@/stores/tradeSortStore';

export function TradeSortSelect({ id, className }: { id: string; className?: string }) {
  const { defaultSort, setDefaultSort } = useTradeSortStore();

  return (
    <Select
      value={defaultSort}
      onValueChange={(value) => {
        if (isTradeSortOrder(value)) setDefaultSort(value);
      }}
    >
      <SelectTrigger
        id={id}
        aria-label="Default trade order"
        className={cn('w-full sm:w-[240px]', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TRADE_SORT_OPTIONS.map(({ value, label }) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

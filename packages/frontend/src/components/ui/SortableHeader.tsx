import { TableHead } from '@/components/ui/table';
import { ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SortDirection } from '@/hooks/useTableSort';

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  activeSortKey: string | null;
  sortDirection: SortDirection;
  onSort: (key: string) => void;
  align?: 'left' | 'right';
  style?: React.CSSProperties;
  className?: string;
}

export function SortableHeader({
  label,
  sortKey,
  activeSortKey,
  sortDirection,
  onSort,
  align = 'left',
  style,
  className,
}: SortableHeaderProps) {
  const isActive = activeSortKey === sortKey;
  const ariaSort = isActive
    ? sortDirection === 'asc'
      ? ('ascending' as const)
      : ('descending' as const)
    : undefined;

  return (
    <TableHead
      style={style}
      className={cn(
        'cursor-pointer select-none hover:text-foreground transition-colors',
        align === 'right' && 'text-right',
        className
      )}
      onClick={() => onSort(sortKey)}
      aria-sort={ariaSort}
    >
      <div
        className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end w-full' : ''}`}
      >
        <span>{label}</span>
        {isActive ? (
          sortDirection === 'asc' ? (
            <ChevronUp className="h-3.5 w-3.5 text-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-foreground" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
        )}
      </div>
    </TableHead>
  );
}

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
      scope="col"
      style={style}
      className={cn('select-none', align === 'right' && 'text-right', className)}
      aria-sort={ariaSort}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex min-h-11 min-w-11 w-full cursor-pointer items-center gap-1 transition-colors hover:text-foreground md:min-h-0 ${align === 'right' ? 'justify-end' : ''}`}
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
      </button>
    </TableHead>
  );
}

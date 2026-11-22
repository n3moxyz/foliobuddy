import { useRef, useState } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';

interface Group {
  orderKey: string;
  label: string;
}

interface GroupOrderProps {
  groups: readonly Group[];
  onSave: (keys: string[]) => boolean;
}

export function PositionGroupOrderDialog({ groups, onSave }: GroupOrderProps) {
  const [open, setOpen] = useState(false);
  const dragging = useRef(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dragging.current = false;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-11 text-muted-foreground sm:h-9">
          <ListOrdered aria-hidden className="mr-1.5 h-4 w-4" />
          Reorder groups
        </Button>
      </DialogTrigger>
      <DialogContent
        mobileSheet
        className="sm:max-w-sm"
        onEscapeKeyDown={(event) => {
          if (dragging.current) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Reorder groups</DialogTitle>
          <DialogDescription>Drag groups into the order you want to see them.</DialogDescription>
        </DialogHeader>
        <GroupOrderEditor
          groups={groups}
          onDragChange={(active) => {
            dragging.current = active;
          }}
          onSave={(keys) => {
            if (!onSave(keys)) return false;
            setOpen(false);
            return true;
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function GroupOrderEditor({
  groups,
  onSave,
  onDragChange,
}: GroupOrderProps & { onDragChange: (active: boolean) => void }) {
  const [initialGroups] = useState(groups);
  const [draft, setDraft] = useState(() => [...initialGroups]);
  const [announcement, setAnnouncement] = useState('');
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function move(from: number, to: number, announce = false) {
    if (from < 0 || to < 0 || to >= draft.length || from === to) return;
    setDraft(arrayMove(draft, from, to));
    if (announce) setAnnouncement(`${draft[from].label} moved to position ${to + 1}.`);
  }

  const keys = draft.map((group) => group.orderKey);
  const changed = draft.some((group, index) => group.orderKey !== initialGroups[index].orderKey);
  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => onDragChange(true)}
        onDragCancel={() => onDragChange(false)}
        onDragEnd={({ active, over }) => {
          onDragChange(false);
          if (over) move(keys.indexOf(String(active.id)), keys.indexOf(String(over.id)));
        }}
      >
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          <ol className="space-y-1.5">
            {draft.map((group, index) => (
              <SortableGroup
                key={group.orderKey}
                group={group}
                first={index === 0}
                last={index === draft.length - 1}
                reduceMotion={reduceMotion}
                onMove={(offset) => move(index, index + offset, true)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button disabled={!changed} onClick={() => onSave(keys)}>
          Save order
        </Button>
      </DialogFooter>
    </>
  );
}

function SortableGroup({
  group,
  first,
  last,
  reduceMotion,
  onMove,
}: {
  group: Group;
  first: boolean;
  last: boolean;
  reduceMotion: boolean;
  onMove: (offset: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.orderKey });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform && { ...transform, x: 0 }),
        transition: reduceMotion ? undefined : transition,
      }}
      className={cn(
        'relative flex items-center gap-1 rounded-md border bg-card pr-1',
        isDragging && 'z-10 border-primary/50 shadow-md'
      )}
    >
      <Button
        {...attributes}
        {...listeners}
        ref={setActivatorNodeRef}
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0 touch-none cursor-grab text-muted-foreground active:cursor-grabbing"
        aria-label={`Drag ${group.label} to reorder`}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </Button>
      <span className="min-w-0 flex-1 break-words text-sm font-medium">{group.label}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0 aria-disabled:opacity-35"
        aria-label={`Move ${group.label} up`}
        aria-disabled={first}
        onClick={() => onMove(-1)}
      >
        <ArrowUp className="h-4 w-4" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0 aria-disabled:opacity-35"
        aria-label={`Move ${group.label} down`}
        aria-disabled={last}
        onClick={() => onMove(1)}
      >
        <ArrowDown className="h-4 w-4" aria-hidden />
      </Button>
    </li>
  );
}

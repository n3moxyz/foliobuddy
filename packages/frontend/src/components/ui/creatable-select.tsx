import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
} from '@/components/ui/select';

const CREATE_OPTION_VALUE = '__create_new_option__';

type InlineBox = 'add' | 'rename';

// Compares names the way the saved lists store them: trimmed, single-spaced, any case.
function optionKey(option: string): string {
  return option.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

interface CreatableSelectProps {
  id?: string;
  value: string;
  options: string[];
  placeholder: string;
  addLabel: string;
  inputPlaceholder: string;
  inputLabel: string;
  adding: boolean;
  inputValue: string;
  onValueChange: (value: string) => void;
  onStartAdding: () => void;
  onInputChange: (value: string) => void;
  onAdd: () => string | null | void;
  onCancel: () => void;
  onEditOption?: (currentValue: string, nextValue: string) => string | null | void;
  onDeleteOption?: (value: string) => boolean | void;
  onClearValue?: () => void;
  isOptionEditable?: (value: string) => boolean;
}

export function CreatableSelect({
  id,
  value,
  options,
  placeholder,
  addLabel,
  inputPlaceholder,
  inputLabel,
  adding,
  inputValue,
  onValueChange,
  onStartAdding,
  onInputChange,
  onAdd,
  onCancel,
  onEditOption,
  onDeleteOption,
  onClearValue,
  isOptionEditable,
}: CreatableSelectProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const addBoxRef = useRef<HTMLDivElement>(null);
  const renameBoxRef = useRef<HTMLDivElement>(null);
  // Closing the list sends focus back to the trigger in a Radix timer that runs after
  // ours, so a box opened from the list takes focus in onCloseAutoFocus instead.
  const focusOnListCloseRef = useRef<InlineBox | null>(null);
  const [open, setOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<string | null>(null);
  const [editInputValue, setEditInputValue] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const editErrorId = useId();
  const editErrorRef = useRef<HTMLParagraphElement>(null);
  const canManageOptions = !!onEditOption || !!onDeleteOption;

  // In a scrolling dialog on a phone, the message can render below the visible edge.
  useEffect(() => {
    if (editError) editErrorRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [editError]);

  const boxInput = (box: InlineBox) => (box === 'add' ? inputRef.current : editInputRef.current);

  const focusBox = (box: InlineBox) => {
    if (open) {
      focusOnListCloseRef.current = box;
      return;
    }
    window.setTimeout(() => boxInput(box)?.focus(), 0);
  };

  const handleListCloseAutoFocus = (event: Event) => {
    const box = focusOnListCloseRef.current;
    focusOnListCloseRef.current = null;
    const input = box ? boxInput(box) : null;
    if (!input) return;

    event.preventDefault();
    input.focus();
  };

  // A box unmounts as it closes. If it held focus, return focus to the field so a
  // keyboard user keeps their place in the form.
  const returnFocusFrom = (box: RefObject<HTMLDivElement>) => {
    if (box.current?.contains(document.activeElement)) {
      triggerRef.current?.focus();
    }
  };

  const stopOptionAction = (
    event: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleCancelEditing = () => {
    returnFocusFrom(renameBoxRef);
    setEditingOption(null);
    setEditInputValue('');
    setEditError(null);
  };

  const handleCancelAdding = () => {
    returnFocusFrom(addBoxRef);
    onCancel();
  };

  const handleAdd = () => {
    const createdOption = onAdd();
    if (createdOption) {
      returnFocusFrom(addBoxRef);
      onValueChange(createdOption);
      handleCancelEditing();
    }
  };

  const handleStartAdding = () => {
    handleCancelEditing();
    onStartAdding();
    setOpen(false);
    focusBox('add');
  };

  const beginEditingOption = (option: string) => {
    onCancel();
    setEditingOption(option);
    setEditInputValue(option);
    setEditError(null);
    setOpen(false);
    focusBox('rename');
  };

  const handleStartEditing = (event: MouseEvent<HTMLButtonElement>, option: string) => {
    stopOptionAction(event);
    beginEditingOption(option);
  };

  const handleSaveEdit = () => {
    if (!editingOption || !onEditOption) return;

    const nextValue = editInputValue.trim();
    if (!nextValue) return;
    if (nextValue === editingOption) {
      handleCancelEditing();
      return;
    }

    // Rename changes only this option's name. A change of capitals keeps the same
    // option; a name that belongs to another option is refused, never merged.
    const nextKey = optionKey(nextValue);
    const takenBy =
      nextKey === optionKey(editingOption)
        ? undefined
        : options.find((option) => optionKey(option) === nextKey);
    if (takenBy) {
      setEditError(`Couldn't rename ${editingOption}. ${takenBy} is already in the list.`);
      editInputRef.current?.focus();
      return;
    }

    const result = onEditOption(editingOption, nextValue);
    if (result === null) return;

    const updatedOption = result ?? nextValue;
    if (value.toLocaleLowerCase() === editingOption.toLocaleLowerCase()) {
      onValueChange(updatedOption);
    }

    handleCancelEditing();
  };

  const removeOption = (option: string) => {
    const deleted = onDeleteOption?.(option);
    if (deleted === false) return;

    if (value.toLocaleLowerCase() === option.toLocaleLowerCase()) {
      onClearValue?.();
    }
    if (editingOption?.toLocaleLowerCase() === option.toLocaleLowerCase()) {
      handleCancelEditing();
    }
    setOpen(false);
  };

  const handleDeleteOption = (event: MouseEvent<HTMLButtonElement>, option: string) => {
    stopOptionAction(event);
    removeOption(option);
  };

  // The dialog holds back Escape inside a box marked data-cancel-on-escape (see
  // DialogPanel), so Escape on the box's field or buttons cancels only that box.
  const handleAddBoxKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') handleCancelAdding();
  };

  const handleRenameBoxKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') handleCancelEditing();
  };

  // Keyboard path for managing customs: the pencil/trash buttons inside the Radix
  // Select popover are pointer-only (a listbox only exposes arrows/typeahead/Enter),
  // so the same actions surface here for the currently selected custom option.
  const selectedManageableOption =
    canManageOptions && value && !adding && !editingOption
      ? (options.find(
          (option) =>
            option.toLocaleLowerCase() === value.toLocaleLowerCase() &&
            (isOptionEditable?.(option) ?? true)
        ) ?? null)
      : null;

  return (
    <div className="flex flex-col gap-2">
      <Select
        open={open}
        onOpenChange={setOpen}
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue === CREATE_OPTION_VALUE) {
            handleStartAdding();
            return;
          }

          onValueChange(nextValue);
          handleCancelEditing();
        }}
      >
        <SelectTrigger ref={triggerRef} id={id}>
          <span className={value ? undefined : 'text-muted-foreground'}>
            {value || placeholder}
          </span>
        </SelectTrigger>
        <SelectContent onCloseAutoFocus={handleListCloseAutoFocus}>
          {options.map((option) => {
            const isEditable = canManageOptions && (isOptionEditable?.(option) ?? true);

            return (
              <div key={option} className="relative">
                <SelectItem value={option} className={isEditable ? 'pr-20' : undefined}>
                  <span className="block truncate">{option}</span>
                </SelectItem>
                {isEditable && (
                  <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
                    {onEditOption && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 shrink-0 sm:h-8 sm:w-8"
                        onPointerDown={stopOptionAction}
                        onClick={(event) => handleStartEditing(event, option)}
                        aria-label={`Rename ${option}`}
                        title={`Rename ${option}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {onDeleteOption && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 shrink-0 sm:h-8 sm:w-8"
                        onPointerDown={stopOptionAction}
                        onClick={(event) => handleDeleteOption(event, option)}
                        aria-label={`Remove ${option}`}
                        title={`Remove ${option}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {options.length > 0 && <SelectSeparator />}
          <SelectItem value={CREATE_OPTION_VALUE}>{addLabel}</SelectItem>
        </SelectContent>
      </Select>

      {selectedManageableOption && (
        <div className="flex gap-1.5">
          {onEditOption && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground"
              onClick={() => beginEditingOption(selectedManageableOption)}
              aria-label={`Rename ${selectedManageableOption}`}
            >
              <Pencil className="mr-1 h-3 w-3" />
              Rename
            </Button>
          )}
          {onDeleteOption && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground"
              onClick={() => removeOption(selectedManageableOption)}
              aria-label={`Remove ${selectedManageableOption}`}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Remove
            </Button>
          )}
        </div>
      )}

      {adding && (
        <div
          ref={addBoxRef}
          className="flex gap-2"
          data-cancel-on-escape
          onKeyDown={handleAddBoxKeyDown}
        >
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleAdd();
              }
            }}
            placeholder={inputPlaceholder}
            aria-label={inputLabel}
          />
          <Button type="button" size="sm" onClick={handleAdd} disabled={!inputValue.trim()}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={handleCancelAdding}>
            Cancel
          </Button>
        </div>
      )}

      {editingOption && onEditOption && (
        <div
          ref={renameBoxRef}
          className="space-y-1.5"
          data-cancel-on-escape
          onKeyDown={handleRenameBoxKeyDown}
        >
          <div className="flex gap-2">
            <Input
              ref={editInputRef}
              value={editInputValue}
              onChange={(event) => {
                setEditInputValue(event.target.value);
                setEditError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleSaveEdit();
                }
              }}
              placeholder={inputPlaceholder}
              aria-label={`New name for ${editingOption}`}
              aria-invalid={editError ? true : undefined}
              aria-describedby={editError ? editErrorId : undefined}
            />
            <Button
              type="button"
              size="sm"
              onClick={handleSaveEdit}
              disabled={!editInputValue.trim()}
            >
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleCancelEditing}>
              Cancel
            </Button>
          </div>
          {editError && (
            <p
              ref={editErrorRef}
              id={editErrorId}
              role="alert"
              className="text-xs text-destructive"
            >
              {editError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

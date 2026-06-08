import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<string | null>(null);
  const [editInputValue, setEditInputValue] = useState('');
  const canManageOptions = !!onEditOption || !!onDeleteOption;

  const stopOptionAction = (
    event: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleAdd = () => {
    const createdOption = onAdd();
    if (createdOption) {
      onValueChange(createdOption);
      setEditingOption(null);
      setEditInputValue('');
    }
  };

  const handleStartAdding = () => {
    setEditingOption(null);
    setEditInputValue('');
    onStartAdding();
    setOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleStartEditing = (event: MouseEvent<HTMLButtonElement>, option: string) => {
    stopOptionAction(event);
    onCancel();
    setEditingOption(option);
    setEditInputValue(option);
    setOpen(false);
    window.setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const handleCancelEditing = () => {
    setEditingOption(null);
    setEditInputValue('');
  };

  const handleSaveEdit = () => {
    if (!editingOption || !onEditOption) return;

    const nextValue = editInputValue.trim();
    if (!nextValue) return;
    if (nextValue === editingOption) {
      handleCancelEditing();
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

  const handleDeleteOption = (event: MouseEvent<HTMLButtonElement>, option: string) => {
    stopOptionAction(event);
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
        <SelectTrigger id={id}>
          <span className={value ? undefined : 'text-muted-foreground'}>
            {value || placeholder}
          </span>
        </SelectTrigger>
        <SelectContent>
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
                        className="h-8 w-8 shrink-0"
                        onPointerDown={stopOptionAction}
                        onClick={(event) => handleStartEditing(event, option)}
                        aria-label={`Edit ${option}`}
                        title={`Edit ${option}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {onDeleteOption && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onPointerDown={stopOptionAction}
                        onClick={(event) => handleDeleteOption(event, option)}
                        aria-label={`Delete ${option}`}
                        title={`Delete ${option}`}
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

      {adding && (
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleAdd();
              }
              if (event.key === 'Escape') {
                onCancel();
              }
            }}
            placeholder={inputPlaceholder}
            aria-label={inputLabel}
          />
          <Button type="button" size="sm" onClick={handleAdd} disabled={!inputValue.trim()}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}

      {editingOption && onEditOption && (
        <div className="flex gap-2">
          <Input
            ref={editInputRef}
            value={editInputValue}
            onChange={(event) => setEditInputValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleSaveEdit();
              }
              if (event.key === 'Escape') {
                handleCancelEditing();
              }
            }}
            placeholder={inputPlaceholder}
            aria-label={`Edit ${editingOption} name`}
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
      )}
    </div>
  );
}

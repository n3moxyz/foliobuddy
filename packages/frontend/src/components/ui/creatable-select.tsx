import { Plus } from 'lucide-react';
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
}: CreatableSelectProps) {
  const handleAdd = () => {
    const createdOption = onAdd();
    if (createdOption) {
      onValueChange(createdOption);
    }
  };

  return (
    <div className="space-y-2">
      <Select
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue === CREATE_OPTION_VALUE) {
            onStartAdding();
            return;
          }

          onValueChange(nextValue);
        }}
      >
        <SelectTrigger id={id}>
          <span className={value ? undefined : 'text-muted-foreground'}>
            {value || placeholder}
          </span>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
          {options.length > 0 && <SelectSeparator />}
          <SelectItem value={CREATE_OPTION_VALUE}>{addLabel}</SelectItem>
        </SelectContent>
      </Select>

      {adding && (
        <div className="flex gap-2">
          <Input
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
            autoFocus
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
    </div>
  );
}

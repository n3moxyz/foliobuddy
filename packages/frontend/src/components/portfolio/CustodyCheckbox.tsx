import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CustodyCheckboxProps {
  id: string;
  isCustody: boolean;
  custodyOf: string;
  addingNewName: boolean;
  newNameInput: string;
  custodyNameOptions: string[];
  showDescription?: boolean;
  onCustodyChange: (checked: boolean) => void;
  onCustodyOfChange: (value: string) => void;
  onStartAddingName: () => void;
  onNewNameInputChange: (value: string) => void;
  onAddNewName: () => void;
  onCancelAddingName: () => void;
}

export function CustodyCheckbox({
  id,
  isCustody,
  custodyOf,
  addingNewName,
  newNameInput,
  custodyNameOptions,
  showDescription = false,
  onCustodyChange,
  onCustodyOfChange,
  onStartAddingName,
  onNewNameInputChange,
  onAddNewName,
  onCancelAddingName,
}: CustodyCheckboxProps) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-3 bg-muted/30">
      <input
        type="checkbox"
        id={id}
        checked={isCustody}
        onChange={(e) => onCustodyChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-purple-600"
      />
      <div className="flex-1 space-y-2">
        <label htmlFor={id} className="text-sm font-medium cursor-pointer leading-tight">
          Custody — held for someone else
        </label>
        {showDescription && (
          <p className="text-xs text-muted-foreground">
            Won't count toward your net worth, P&L, or exposure
          </p>
        )}
        {isCustody && !addingNewName && (
          <Select
            value={custodyOf}
            onValueChange={(v) => {
              if (v === '__new__') {
                onStartAddingName();
              } else {
                onCustodyOfChange(v);
              }
            }}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Who is this for?" />
            </SelectTrigger>
            <SelectContent>
              {custodyNameOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
              <SelectItem value="__new__">+ Add new person</SelectItem>
            </SelectContent>
          </Select>
        )}
        {isCustody && addingNewName && (
          <div className="flex gap-2 mt-1">
            <Input
              value={newNameInput}
              onChange={(e) => onNewNameInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onAddNewName();
                }
                if (e.key === 'Escape') {
                  onCancelAddingName();
                }
              }}
              placeholder="Enter name..."
              autoFocus
            />
            <Button type="button" size="sm" onClick={onAddNewName} disabled={!newNameInput.trim()}>
              Add
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

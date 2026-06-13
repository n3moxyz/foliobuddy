import { CreatableSelect } from '@/components/ui/creatable-select';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CategoryType, PositionStorageType } from './positionFormTypes';

interface StorageTypeOption {
  readonly value: PositionStorageType;
  readonly label: string;
}

interface PositionStorageFieldsProps {
  category: CategoryType;
  storageType: PositionStorageType;
  storageTypeOptions: readonly StorageTypeOption[];
  storageLocation: string;
  storageLocationLabel: string;
  locationOptions: string[];
  editableLocationOptions: ReadonlySet<string>;
  addingStorageLocation: boolean;
  newStorageLocation: string;
  onStorageTypeChange: (value: PositionStorageType) => void;
  onStorageLocationChange: (value: string) => void;
  onStartAddingStorageLocation: () => void;
  onNewStorageLocationChange: (value: string) => void;
  onAddStorageLocation: () => string | null | void;
  onCancelStorageLocation: () => void;
  onEditStorageLocation: (currentValue: string, nextValue: string) => string | null | void;
  onDeleteStorageLocation: (value: string) => boolean | void;
  onClearStorageLocation: () => void;
}

export function PositionStorageFields({
  category,
  storageType,
  storageTypeOptions,
  storageLocation,
  storageLocationLabel,
  locationOptions,
  editableLocationOptions,
  addingStorageLocation,
  newStorageLocation,
  onStorageTypeChange,
  onStorageLocationChange,
  onStartAddingStorageLocation,
  onNewStorageLocationChange,
  onAddStorageLocation,
  onCancelStorageLocation,
  onEditStorageLocation,
  onDeleteStorageLocation,
  onClearStorageLocation,
}: PositionStorageFieldsProps) {
  const isEditableLocation = (option: string) =>
    editableLocationOptions.has(option.toLocaleLowerCase());

  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="pos-storage-type" className="text-sm">
          Storage Type
        </Label>
        {category === 'equity' ? (
          <CreatableSelect
            id="pos-storage-type"
            value={storageLocation}
            options={locationOptions}
            placeholder="Select broker"
            addLabel="+ Add new broker"
            inputPlaceholder="Enter broker name..."
            inputLabel="New broker name"
            adding={addingStorageLocation}
            inputValue={newStorageLocation}
            onValueChange={(value) => {
              if (!value) return;
              onStorageLocationChange(value);
            }}
            onStartAdding={onStartAddingStorageLocation}
            onInputChange={onNewStorageLocationChange}
            onAdd={onAddStorageLocation}
            onCancel={onCancelStorageLocation}
            onEditOption={onEditStorageLocation}
            onDeleteOption={onDeleteStorageLocation}
            onClearValue={onClearStorageLocation}
            isOptionEditable={isEditableLocation}
          />
        ) : (
          <Select
            value={storageType}
            onValueChange={(value) => onStorageTypeChange(value as PositionStorageType)}
          >
            <SelectTrigger id="pos-storage-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {storageTypeOptions.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {category !== 'equity' && (
        <div className="space-y-1">
          <Label htmlFor="pos-storage-location" className="text-sm">
            {storageLocationLabel}
          </Label>
          <CreatableSelect
            id="pos-storage-location"
            value={storageLocation}
            options={locationOptions}
            placeholder={`Select ${storageLocationLabel.toLowerCase()}`}
            addLabel={`+ Add new ${storageLocationLabel.toLowerCase()}`}
            inputPlaceholder={`Enter ${storageLocationLabel.toLowerCase()} name...`}
            inputLabel={`New ${storageLocationLabel.toLowerCase()} name`}
            adding={addingStorageLocation}
            inputValue={newStorageLocation}
            onValueChange={(value) => {
              if (!value) return;
              onStorageLocationChange(value);
            }}
            onStartAdding={onStartAddingStorageLocation}
            onInputChange={onNewStorageLocationChange}
            onAdd={onAddStorageLocation}
            onCancel={onCancelStorageLocation}
            onEditOption={onEditStorageLocation}
            onDeleteOption={onDeleteStorageLocation}
            onClearValue={onClearStorageLocation}
            isOptionEditable={isEditableLocation}
          />
        </div>
      )}
    </>
  );
}

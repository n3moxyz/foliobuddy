import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ReducePresetEditor({
  percentages,
  onSave,
  onCancel,
}: {
  percentages: readonly number[];
  onSave: (percentages: number[]) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(() => percentages.map(String));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const firstInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstInput.current?.focus();
  }, []);

  const save = async () => {
    if (saving) return;
    const values = draft.map(Number);
    if (
      draft.some((value) => !/^\d+$/.test(value)) ||
      values.some((value) => value < 1 || value > 100) ||
      new Set(values).size !== 4
    ) {
      setError('Enter four different whole percentages from 1 to 100.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(values);
    } catch {
      setError("Couldn't save percentages. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div
      role="group"
      aria-label="Edit Reduce Percentages"
      data-cancel-on-escape
      className="space-y-3 border-t border-border/60 pt-3"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          if (!saving) onCancel();
        } else if (event.key === 'Enter') {
          // Enter in a preset field saves defaults, never the position form.
          if (event.target instanceof HTMLInputElement) {
            event.preventDefault();
            void save();
          }
        }
      }}
    >
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        Used for all positions. Enter four different whole percentages from 1 to 100.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {draft.map((value, index) => (
          <div key={index} className="space-y-1">
            <Label htmlFor={`${id}-${index}`} className="text-xs">
              Button {index + 1} (%)
            </Label>
            <Input
              ref={index === 0 ? firstInput : undefined}
              id={`${id}-${index}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              step={1}
              value={value}
              disabled={saving}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
              className="bg-background/50 font-mono tabular-nums"
              onChange={(event) => {
                const next = event.target.value;
                setDraft((current) => current.map((item, i) => (i === index ? next : item)));
                setError(null);
              }}
            />
          </div>
        ))}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save Percentages'}
        </Button>
      </div>
    </div>
  );
}

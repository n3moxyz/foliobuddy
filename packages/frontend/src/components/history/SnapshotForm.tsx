import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateManualSnapshot, useUpdateSnapshot } from '@/hooks/useSnapshots';
import type { Snapshot } from '@/lib/types';
import { SnapshotImportTab } from './SnapshotImportTab';

interface SnapshotFormProps {
  snapshot?: Snapshot;
  fxRate: number;
  onSuccess: () => void;
  onCancel: () => void;
}

type FormMode = 'add' | 'import';

export function SnapshotForm({ snapshot, fxRate, onSuccess, onCancel }: SnapshotFormProps) {
  const isEditing = !!snapshot;
  const isAutomatic = snapshot?.source === 'AUTOMATIC';

  // Form mode state
  const [mode, setMode] = useState<FormMode>('add');

  // Add form state
  const [timestamp, setTimestamp] = useState(
    snapshot
      ? new Date(snapshot.timestamp).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]
  );
  const [inputCurrency, setInputCurrency] = useState<'USD' | 'SGD'>('USD');
  const [totalValue, setTotalValue] = useState(snapshot ? snapshot.totalValueUsd.toString() : '');
  const [notes, setNotes] = useState(snapshot?.notes || '');

  const createSnapshot = useCreateManualSnapshot();
  const updateSnapshot = useUpdateSnapshot();

  const isLoading = createSnapshot.isPending || updateSnapshot.isPending;

  // Convert to USD if input is in SGD
  const getValueInUsd = () => {
    const value = parseFloat(totalValue);
    if (isNaN(value)) return 0;
    return inputCurrency === 'SGD' ? value / fxRate : value;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const valueInUsd = getValueInUsd();

    if (isEditing && snapshot) {
      await updateSnapshot.mutateAsync({
        id: snapshot.id,
        data: {
          ...(isAutomatic ? {} : { timestamp }),
          totalValueUsd: valueInUsd,
          notes: notes || undefined,
        },
      });
    } else {
      await createSnapshot.mutateAsync({
        manual: true,
        timestamp,
        totalValueUsd: valueInUsd,
        notes: notes || undefined,
      });
    }

    onSuccess();
  };

  // Don't show mode toggle when editing
  if (isEditing) {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Date */}
        <div className="space-y-2">
          <Label htmlFor="timestamp">Date</Label>
          <Input
            id="timestamp"
            type="date"
            value={timestamp}
            onChange={(e) => setTimestamp(e.target.value)}
            disabled={isAutomatic}
            required
          />
          {isAutomatic && (
            <p className="text-xs text-muted-foreground">
              Date cannot be changed for automatic snapshots
            </p>
          )}
        </div>

        {/* Total Value with Currency Toggle */}
        <div className="space-y-2">
          <Label htmlFor="totalValue">Total Value</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                {inputCurrency === 'USD' ? '$' : 'S$'}
              </span>
              <Input
                id="totalValue"
                type="number"
                step="any"
                value={totalValue}
                onChange={(e) => setTotalValue(e.target.value)}
                placeholder="0.00"
                className="pl-9"
                required
              />
            </div>
            <div className="flex rounded-md border overflow-hidden">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`h-9 px-3 rounded-none ${
                  inputCurrency === 'USD'
                    ? 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
                onClick={() => setInputCurrency('USD')}
              >
                USD
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`h-9 px-3 rounded-none border-l ${
                  inputCurrency === 'SGD'
                    ? 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
                onClick={() => setInputCurrency('SGD')}
              >
                SGD
              </Button>
            </div>
          </div>
          {inputCurrency === 'SGD' && totalValue && (
            <p className="text-xs text-muted-foreground">
              ≈ $
              {getValueInUsd().toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              USD (rate: {fxRate.toFixed(4)})
            </p>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Notes (Optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes about this snapshot..."
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || !totalValue}>
            {isLoading ? 'Saving...' : 'Update'}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div role="tablist" className="flex border-b mb-2">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'add'}
          aria-controls="snapshot-panel-add"
          onClick={() => setMode('add')}
          className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
            mode === 'add'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Add New
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'import'}
          aria-controls="snapshot-panel-import"
          onClick={() => setMode('import')}
          className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
            mode === 'import'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Import
        </button>
      </div>

      {mode === 'import' ? (
        <div id="snapshot-panel-import" role="tabpanel">
          <SnapshotImportTab onSuccess={onSuccess} />
        </div>
      ) : (
        /* Add New Mode */
        <form id="snapshot-panel-add" role="tabpanel" onSubmit={handleSubmit} className="space-y-4">
          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="timestamp">Date</Label>
            <Input
              id="timestamp"
              type="date"
              value={timestamp}
              onChange={(e) => setTimestamp(e.target.value)}
              required
            />
          </div>

          {/* Total Value with Currency Toggle */}
          <div className="space-y-2">
            <Label htmlFor="totalValue">Total Value</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {inputCurrency === 'USD' ? '$' : 'S$'}
                </span>
                <Input
                  id="totalValue"
                  type="number"
                  step="any"
                  value={totalValue}
                  onChange={(e) => setTotalValue(e.target.value)}
                  placeholder="0.00"
                  className="pl-9"
                  required
                />
              </div>
              <div className="flex rounded-md border overflow-hidden">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`h-9 px-3 rounded-none ${
                    inputCurrency === 'USD'
                      ? 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => setInputCurrency('USD')}
                >
                  USD
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`h-9 px-3 rounded-none border-l ${
                    inputCurrency === 'SGD'
                      ? 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => setInputCurrency('SGD')}
                >
                  SGD
                </Button>
              </div>
            </div>
            {inputCurrency === 'SGD' && totalValue && (
              <p className="text-xs text-muted-foreground">
                ≈ $
                {getValueInUsd().toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                USD (rate: {fxRate.toFixed(4)})
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this snapshot..."
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !totalValue}>
              {isLoading ? 'Saving...' : 'Add Snapshot'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

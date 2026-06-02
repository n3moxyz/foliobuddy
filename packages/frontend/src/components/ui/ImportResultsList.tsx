import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export interface ImportResultItem {
  success: boolean;
  label: string; // Display identifier, such as symbol for positions/trades or timestamp for snapshots.
  error?: string;
}

interface ImportResultsListProps {
  results: ImportResultItem[];
  onDone: () => void;
}

/**
 * Generic import results view used by PositionImportTab, TradeImportTab, and SnapshotImportTab.
 * Shows success/fail summary icon, per-item status rows, and a "Done" button.
 */
export function ImportResultsList({ results, onDone }: ImportResultsListProps) {
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  return (
    <div className="space-y-4">
      <div className="text-center py-4">
        {failCount === 0 ? (
          <CheckCircle2 className="h-12 w-12 text-profit mx-auto mb-2" />
        ) : (
          <AlertCircle className="h-12 w-12 text-warning mx-auto mb-2" />
        )}
        <p className="font-medium">
          {successCount} imported successfully
          {failCount > 0 && `, ${failCount} failed`}
        </p>
      </div>

      <div className="max-h-60 overflow-y-auto space-y-1">
        {results.map((result) => (
          <div
            key={`${result.label}-${result.success ? 'success' : 'fail'}-${result.error ?? ''}`}
            className={`text-sm px-3 py-2 rounded-md flex items-center gap-2 ${
              result.success ? 'bg-profit' : 'bg-loss'
            }`}
          >
            {result.success ? (
              <CheckCircle2 className="h-4 w-4 text-profit flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-loss flex-shrink-0" />
            )}
            <span className="font-medium">{result.label}</span>
            {result.error && <span className="text-loss text-xs">{result.error}</span>}
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={onDone}>Close Import</Button>
      </div>
    </div>
  );
}

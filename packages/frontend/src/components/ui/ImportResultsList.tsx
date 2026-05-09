import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export interface ImportResultItem {
  success: boolean;
  label: string; // display identifier — symbol for positions/trades, timestamp for snapshots
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
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
        ) : (
          <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-2" />
        )}
        <p className="font-medium">
          {successCount} imported successfully
          {failCount > 0 && `, ${failCount} failed`}
        </p>
      </div>

      <div className="max-h-60 overflow-y-auto space-y-1">
        {results.map((result, i) => (
          <div
            key={i}
            className={`text-sm px-3 py-2 rounded-md flex items-center gap-2 ${
              result.success ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50 dark:bg-red-950/30'
            }`}
          >
            {result.success ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
            )}
            <span className="font-medium">{result.label}</span>
            {result.error && (
              <span className="text-red-600 dark:text-red-400 text-xs">{result.error}</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={onDone}>Close Import</Button>
      </div>
    </div>
  );
}

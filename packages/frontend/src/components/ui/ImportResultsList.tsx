import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

export interface ImportResultItem {
  success: boolean;
  label: string; // Display identifier, such as symbol for positions/trades or timestamp for snapshots.
  error?: string;
}

interface ImportResultsListProps {
  results: ImportResultItem[];
  onDone: () => void;
  onRetry?: () => void;
  onEditFailed?: () => void;
  retrying?: boolean;
  outcomeKnown?: boolean;
  error?: string | null;
}

/**
 * Generic import results view used by PositionImportTab, TradeImportTab, and SnapshotImportTab.
 * Shows success/fail summary icon, per-item status rows, and a "Done" button.
 */
export function ImportResultsList({
  results,
  onDone,
  onRetry,
  onEditFailed,
  retrying = false,
  outcomeKnown = true,
  error,
}: ImportResultsListProps) {
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  const canRetry = !!onRetry && (failCount > 0 || !outcomeKnown);

  return (
    <div className="space-y-4" aria-busy={retrying}>
      <div className="text-center py-4">
        {failCount === 0 && outcomeKnown ? (
          <CheckCircle2 className="h-12 w-12 text-profit mx-auto mb-2" />
        ) : (
          <AlertCircle className="h-12 w-12 text-warning mx-auto mb-2" />
        )}
        <p className="font-medium">
          {!outcomeKnown && 'Last confirmed result: '}
          {successCount} imported successfully
          {failCount > 0 && `, ${failCount} failed`}
        </p>
      </div>

      <div className="max-h-60 overflow-y-auto space-y-1">
        {results.map((result, index) => (
          <div
            key={index}
            className={`text-sm px-3 py-2 rounded-md flex items-start gap-2 ${
              result.success ? 'bg-profit' : 'bg-loss'
            }`}
          >
            {result.success ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-profit flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 mt-0.5 text-loss flex-shrink-0" />
            )}
            <span className="min-w-0 break-words font-medium">{result.label}</span>
            {result.error && (
              <span className="min-w-0 break-words text-loss text-xs">{result.error}</span>
            )}
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive break-words">
          {error}
        </p>
      )}

      {!outcomeKnown && !retrying && (
        <p role="status" className="text-sm text-warning break-words">
          Some rows may already be saved. Retry the original batch to check the latest result before
          editing.
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {failCount > 0 && onEditFailed && (
          <Button
            type="button"
            variant="outline"
            onClick={onEditFailed}
            disabled={retrying || !outcomeKnown}
          >
            Edit failed rows
          </Button>
        )}
        {canRetry && (
          <Button type="button" onClick={onRetry} disabled={retrying}>
            {retrying ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Retrying...
              </>
            ) : outcomeKnown ? (
              'Retry failed import'
            ) : (
              'Retry original batch'
            )}
          </Button>
        )}
        <Button
          type="button"
          variant={canRetry ? 'outline' : 'default'}
          onClick={onDone}
          disabled={retrying}
        >
          Close Import
        </Button>
      </div>
    </div>
  );
}

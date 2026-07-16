import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import type { BulkImportSnapshot } from '@/lib/types';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, AlertCircle, Loader2 } from 'lucide-react';
import { ImportResultsList, type ImportResultItem } from '@/components/ui/ImportResultsList';

interface SnapshotImportTabProps {
  onSuccess: () => void;
}

export function SnapshotImportTab({ onSuccess }: SnapshotImportTabProps) {
  const queryClient = useQueryClient();
  const [jsonInput, setJsonInput] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedSnapshots, setParsedSnapshots] = useState<BulkImportSnapshot[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResultItem[] | null>(null);

  const handleJsonChange = (value: string) => {
    setJsonInput(value);
    setParseError(null);
    setParsedSnapshots(null);
    setImportResults(null);

    if (!value.trim()) return;

    try {
      const parsed = JSON.parse(value);
      const snapshots: BulkImportSnapshot[] = Array.isArray(parsed) ? parsed : [parsed];

      // Validate each snapshot
      for (const snap of snapshots) {
        if (!snap.timestamp) {
          throw new Error('Each snapshot must have a timestamp');
        }
        if (typeof snap.totalValueUsd !== 'number' || snap.totalValueUsd < 0) {
          throw new Error('Each snapshot must have a valid totalValueUsd (number >= 0)');
        }
      }

      setParsedSnapshots(snapshots);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Invalid JSON format');
    }
  };

  const handleImport = async () => {
    if (!parsedSnapshots) return;

    setImporting(true);

    try {
      const response = await api.bulkImportSnapshots(parsedSnapshots);
      setImportResults(response.results.map((r) => ({ ...r, label: r.timestamp })));
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Import failed - please try again');
    } finally {
      setImporting(false);
    }

    // Refresh snapshots data
    queryClient.invalidateQueries({ queryKey: ['snapshots'] });
    queryClient.invalidateQueries({ queryKey: ['portfolio', 'performance'] });
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setJsonInput(text);
      handleJsonChange(text);
    } catch {
      setParseError('Failed to read clipboard. Please paste manually.');
    }
  };

  if (importResults) {
    return <ImportResultsList results={importResults} onDone={onSuccess} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handlePaste}>
          <Upload className="h-4 w-4 mr-1" />
          Paste from Clipboard
        </Button>
      </div>

      <Textarea
        aria-label="Snapshot JSON to import"
        value={jsonInput}
        onChange={(e) => handleJsonChange(e.target.value)}
        placeholder='[{"timestamp": "2026-01-01", "totalValueUsd": 100000}, ...]'
        rows={6}
        className="font-mono text-xs"
      />

      {parseError && (
        <div className="flex items-start gap-2 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{parseError}</span>
        </div>
      )}

      {parsedSnapshots && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Ready to import {parsedSnapshots.length} snapshot
            {parsedSnapshots.length !== 1 ? 's' : ''}:
          </p>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {parsedSnapshots.map((snap) => (
              <div
                key={`${snap.timestamp}-${snap.snapshotType ?? 'DAILY'}-${snap.totalValueUsd}`}
                className="text-sm bg-muted/50 px-3 py-2 rounded-md"
              >
                <span className="font-medium">{snap.timestamp}</span>
                <span className="text-muted-foreground ml-2">
                  ${snap.totalValueUsd.toLocaleString()}
                </span>
                {snap.notes && <span className="text-muted-foreground ml-2">({snap.notes})</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="button" onClick={handleImport} disabled={!parsedSnapshots || importing}>
          {importing ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              Import {parsedSnapshots?.length ?? 0} Snapshot
              {parsedSnapshots?.length !== 1 ? 's' : ''}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

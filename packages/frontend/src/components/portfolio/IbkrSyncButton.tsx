import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { Copy, ExternalLink, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import type { Position } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDateTime } from '@/lib/utils';
import {
  ibkrCodexUrl,
  ibkrSyncPrompt,
  isOwnedIbkrPosition,
  parseCodexChatId,
  readIbkrCodexChat,
  saveIbkrCodexChat,
  subscribeIbkrCodexChat,
} from './ibkrCodexSync';

/** This handoff opens a draft; only the existing reconciliation flow writes data. */
export function IbkrSyncButton({
  position,
  disabled = false,
}: {
  position: Position;
  disabled?: boolean;
}) {
  if (!isOwnedIbkrPosition(position)) return null;
  return <IbkrSyncControl position={position} disabled={disabled} />;
}

function IbkrSyncControl({ position, disabled }: { position: Position; disabled: boolean }) {
  const fieldId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const threadId = useSyncExternalStore(
    subscribeIbkrCodexChat,
    () => readIbkrCodexChat(position.id),
    () => null
  );
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const candidate = parseCodexChatId(link);
  const capturedAt =
    position.ibkrCash?.source === 'ibkr' ? position.ibkrCash.capturedAt : position.ibkrSyncedAt;
  const lastCapture = capturedAt && Number.isFinite(Date.parse(capturedAt)) ? capturedAt : null;

  function configure() {
    setLink(threadId ? `codex://threads/${threadId}` : '');
    setError(null);
    setOpen(true);
  }

  function handoff() {
    toast.info('Press Send in Codex to start the sync', {
      description: 'Your portfolio updates after Codex saves and verifies the broker capture.',
    });
  }

  async function copyRequest() {
    try {
      await navigator.clipboard.writeText(ibkrSyncPrompt(position.id));
      toast.success('Sync request copied', {
        description: 'Paste it into your IBKR Codex chat and press Send.',
      });
    } catch {
      toast.error('Could not copy the sync request', {
        description: 'Allow clipboard access or open your configured Codex chat.',
      });
    }
  }

  return (
    <>
      <div className="inline-flex shrink-0 items-center gap-1">
        {threadId && !disabled ? (
          <Button ref={triggerRef} variant="outline" size="sm" asChild>
            <a href={ibkrCodexUrl(threadId, position.id)} onClick={handoff}>
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Sync via Codex
            </a>
          </Button>
        ) : (
          <Button
            ref={triggerRef}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={configure}
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Sync via Codex
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label="IBKR sync options"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={configure}>
              {threadId ? 'Change Codex chat' : 'Set up Codex chat'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void copyRequest()}>
              Copy sync request
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="!bottom-0 !left-0 !top-auto max-h-[85vh] w-full max-w-none !translate-x-0 !translate-y-0 overflow-y-auto rounded-b-none rounded-t-lg pb-[max(1rem,env(safe-area-inset-bottom))] sm:!bottom-auto sm:!left-[50%] sm:!top-[50%] sm:w-[calc(100%-2rem)] sm:max-w-md sm:!translate-x-[-50%] sm:!translate-y-[-50%] sm:rounded-lg sm:pb-6"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{threadId ? 'IBKR sync chat' : 'Set up Sync via Codex'}</DialogTitle>
            <DialogDescription>
              Open your IBKR Codex chat with a prepared sync request, then press Send.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Uses your existing IBKR plugin connection. Keep this Mac on and FolioBuddy signed in.
              If the connection expires, Codex will ask you to reconnect.
            </p>
            <div className="space-y-2">
              <Label htmlFor={fieldId}>Codex chat link</Label>
              <Input
                id={fieldId}
                value={link}
                placeholder="codex://threads/…"
                autoComplete="off"
                maxLength={500}
                spellCheck={false}
                aria-invalid={Boolean(error)}
                aria-describedby={`${fieldId}-help${error ? ` ${fieldId}-error` : ''}`}
                onChange={(event) => {
                  setLink(event.target.value);
                  setError(null);
                }}
              />
              <p id={`${fieldId}-help`} className="text-xs text-muted-foreground">
                Ask your IBKR Codex chat for its local chat link and paste it here. The link is
                saved only in this browser for this IBKR portfolio.
              </p>
              {error && (
                <p id={`${fieldId}-error`} role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {lastCapture
                ? `Last saved broker capture: ${formatDateTime(lastCapture)}.`
                : 'No broker capture saved yet.'}{' '}
              Opening Codex does not update your positions until the sync finishes.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => void copyRequest()}>
              <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Copy sync request
            </Button>
            {candidate ? (
              <Button asChild>
                <a
                  href={ibkrCodexUrl(candidate, position.id)}
                  onClick={(event) => {
                    try {
                      saveIbkrCodexChat(position.id, candidate);
                      setOpen(false);
                      handoff();
                    } catch {
                      event.preventDefault();
                      setError(
                        'This browser could not save the chat link. Allow local storage, or use Copy sync request.'
                      );
                    }
                  }}
                >
                  Open Codex
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() =>
                  setError(
                    'Enter a local chat link (codex://threads/…) or its chat ID. Shared web links cannot open this chat.'
                  )
                }
              >
                Open Codex
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import type { Position } from '@/lib/types';

const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SETTINGS_EVENT = 'foliobuddy-ibkr-codex-chat-changed';
const storageKey = (positionId: string) => `foliobuddy-ibkr-codex-chat:${positionId}`;

export function isOwnedIbkrPosition(position: Position) {
  return (
    position.storageType === 'BROKERAGE' &&
    position.storageLocation === 'IBKR' &&
    !position.custodyOf &&
    ['EQUITY', 'UNIT_TRUST', 'CASH'].includes(position.asset.category)
  );
}

/** Accept a local chat link or ID, never an arbitrary navigation target or prompt. */
export function parseCodexChatId(value: string): string | null {
  const trimmed = value.trim();
  if (THREAD_ID.test(trimmed)) return trimmed.toLowerCase();
  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== 'codex:' ||
      url.hostname !== 'threads' ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    )
      return null;
    const id = url.pathname.slice(1);
    // Query parameters (including a supplied prompt/remote host) are discarded.
    return THREAD_ID.test(id) ? id.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function ibkrSyncPrompt(positionId: string): string {
  return `Sync my latest owned IBKR positions and currency cash/debt into FolioBuddy now, using the existing Interactive Brokers plugin for reads and my signed-in FolioBuddy browser session for app edits.

Follow the FolioBuddy workspace AGENTS.md and docs/solutions/2026-09-30-ibkr-cash-sync.md. Before any write, verify the signed-in portfolio owns the IBKR position with reference ${JSON.stringify(positionId)}. Stop if that reference, account identity or required access cannot be verified.

Read all broker positions, currency balances and account summary twice within three minutes. Record actual receipt timestamps after each complete sample; never reuse an old capture with a new timestamp. Read recent executions; use only unambiguous symbols, quantities, sides and UTC dates as closing-sale evidence. Validate complete source responses, stable native quantities/averages/cash, currency/BASE totals and account securities totals. Stop on stale, incomplete, unsupported, ambiguous or unexpectedly empty data, missing closing evidence or changed records.

Preview the complete capture in the owned IBKR cash panel using Import broker capture. Review every quantity, native average and currency cash/debt value. Download the private checkpoint, finish any browser Save dialog and verify the file is readable before applying. Keep receipts, captures, checkpoints and independent readbacks under .local/ibkr-sync/YYYY-MM-DD (directory 0700, files 0600, outside Git). Apply only the reviewed state, then independently verify saved records and the source timestamp. Stop on any validation or readback error.

Preserve original USD purchase records, the repaired historical native ledger and all trade/position histories. Touch only owned IBKR records. Never invent fills or historical FX, submit broker orders, convert currency, transfer funds, change broker settings, obtain/copy credentials, bypass authentication or grant new permissions. If login or access has expired, stop and tell me. Report exact changed lines, or confirm a verified no-change result.`;
}

export function ibkrCodexUrl(threadId: string, positionId: string): string {
  if (!THREAD_ID.test(threadId)) throw new Error('Invalid Codex chat ID');
  return `codex://threads/${threadId.toLowerCase()}?prompt=${encodeURIComponent(ibkrSyncPrompt(positionId))}`;
}

export function readIbkrCodexChat(positionId: string): string | null {
  try {
    return parseCodexChatId(localStorage.getItem(storageKey(positionId)) ?? '');
  } catch {
    return null;
  }
}

/** Throw on blocked storage so setup never claims the link was remembered. */
export function saveIbkrCodexChat(positionId: string, threadId: string): void {
  if (!THREAD_ID.test(threadId)) throw new Error('Invalid Codex chat ID');
  localStorage.setItem(storageKey(positionId), threadId.toLowerCase());
  window.dispatchEvent(new Event(SETTINGS_EVENT));
}

export function subscribeIbkrCodexChat(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(SETTINGS_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(SETTINGS_EVENT, onChange);
  };
}

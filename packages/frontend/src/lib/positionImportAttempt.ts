import { captureAuthSession, isAuthSessionCurrent, type AuthSession } from './authSession';

export interface PositionImportAttempt {
  input: string;
  requestId: string;
  session: AuthSession;
  draft?: boolean;
}

const STORAGE_KEY = 'foliobuddy-pending-position-imports-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type SavedAttempt = Pick<PositionImportAttempt, 'input' | 'requestId' | 'draft'> & {
  superseded?: boolean;
};
type Journal = { scope: string; attempts: SavedAttempt[] };

// Session storage survives reload in this tab. Never store a token or share
// recovery between accounts, sign-in sessions, or API destinations.
const pendingImports = new WeakMap<AuthSession, Map<string, PositionImportAttempt>>();
const observedSessions = new WeakSet<AuthSession>();

function scope(session: AuthSession) {
  return JSON.stringify([
    import.meta.env.VITE_API_URL || '/api/v1',
    session.mode,
    session.ownerId,
    session.sessionId,
  ]);
}

function readJournal(session: AuthSession): Journal {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { scope: scope(session), attempts: [] };
    const saved = JSON.parse(raw) as Journal;
    if (typeof saved?.scope !== 'string') throw new Error('Invalid recovery scope');
    if (saved.scope !== scope(session)) return { scope: scope(session), attempts: [] };
    if (
      !Array.isArray(saved.attempts) ||
      saved.attempts.some(
        (attempt) =>
          typeof attempt?.input !== 'string' ||
          typeof attempt?.requestId !== 'string' ||
          (attempt.draft !== undefined && typeof attempt.draft !== 'boolean') ||
          (attempt.superseded !== undefined && typeof attempt.superseded !== 'boolean') ||
          !UUID.test(attempt.requestId) ||
          !Array.isArray(JSON.parse(attempt.input))
      )
    )
      throw new Error('Invalid recovery data');
    return saved;
  } catch {
    throw new Error(
      'Import recovery could not be read. Check your saved positions before clearing browser data.'
    );
  }
}

function saveJournal(journal: Journal) {
  try {
    if (journal.attempts.length) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(journal));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    throw new Error('Import recovery could not be saved. Enable session storage before importing.');
  }
}

export function clearPositionImportRecovery() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Blocked storage must not prevent sign-out.
  }
}

export function watchPositionImportSession(session: AuthSession) {
  // The prior identity may have expired while this tab was closed or reloading.
  // Its runtime cannot install an abort listener in the new signed-in session.
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const saved = raw ? (JSON.parse(raw) as Journal) : null;
    if (typeof saved?.scope === 'string' && saved.scope !== scope(session))
      sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Leave unreadable current recovery intact so imports still fail closed.
  }
  if (!observedSessions.has(session)) {
    observedSessions.add(session);
    session.signal.addEventListener(
      'abort',
      () => {
        // React can reinstall the same identity during its Strict Mode checks.
        queueMicrotask(() => {
          if (scope(captureAuthSession()) === scope(session)) return;
          try {
            const raw = sessionStorage.getItem(STORAGE_KEY);
            if (raw && (JSON.parse(raw) as Journal).scope === scope(session))
              sessionStorage.removeItem(STORAGE_KEY);
          } catch {
            /* Blocked storage must not affect account cleanup. */
          }
        });
      },
      { once: true }
    );
  }
}

export function pendingPositionImports(): PositionImportAttempt[] {
  const session = captureAuthSession();
  watchPositionImportSession(session);
  const journal = readJournal(session);
  let pending = pendingImports.get(session);
  if (!pending) {
    pending = new Map();
    pendingImports.set(session, pending);
  }
  return journal.attempts
    .filter((saved) => !saved.superseded)
    .map((saved) => {
      let attempt = pending!.get(saved.input);
      if (attempt?.requestId !== saved.requestId || attempt?.draft !== saved.draft) {
        attempt = { ...saved, session };
        pending!.set(saved.input, attempt);
      }
      return attempt!;
    });
}

export function beginPositionImport(
  input: string,
  previous?: PositionImportAttempt
): PositionImportAttempt {
  const session = captureAuthSession();
  const attempts = pendingPositionImports();
  const journal = readJournal(session);
  if (previous && !isAuthSessionCurrent(previous.session))
    throw new Error('The signed-in account changed. Reopen Import from the current account.');
  const preferred = previous
    ? journal.attempts.find((saved) => saved.requestId === previous.requestId)
    : undefined;
  if (
    previous &&
    (!preferred || preferred.superseded || (!preferred.draft && preferred.input !== input))
  )
    throw new Error('This import has already changed. Reopen its recovery before retrying.');
  if (
    preferred?.input !== input &&
    journal.attempts.some((saved) => saved.input === input && saved.superseded)
  )
    throw new Error(
      "This batch was split into a correction. Resume Interrupted Import if it's listed, or check your saved positions before importing again."
    );
  let attempt = attempts.find((saved) => saved.input === input);
  const draft = preferred?.draft ? preferred : undefined;
  if (preferred)
    attempt =
      previous?.input === input && !previous.draft
        ? previous
        : { input, requestId: preferred.requestId, session };
  if (!attempt) {
    attempt = { input, requestId: draft?.requestId ?? crypto.randomUUID(), session };
  }
  if (attempt.draft) attempt = { input, requestId: attempt.requestId, session };
  // Save BEFORE dispatch. A storage failure must never create an untracked write.
  saveJournal({
    scope: scope(session),
    attempts: [
      ...journal.attempts.filter(
        (saved) => saved.requestId !== attempt.requestId && saved.requestId !== draft?.requestId
      ),
      { input, requestId: attempt.requestId },
    ],
  });
  pendingImports.get(session)!.set(input, attempt);
  return attempt;
}

/** Seal the partial batch and save its correction before exposing an editor. */
export function preparePositionImportCorrection(
  original: PositionImportAttempt,
  input: string
): PositionImportAttempt {
  if (!isAuthSessionCurrent(original.session)) throw new Error('The signed-in account changed.');
  const journal = readJournal(original.session);
  if (
    !journal.attempts.some((saved) => saved.requestId === original.requestId && !saved.superseded)
  )
    throw new Error('This import has already changed. Reopen its recovery before editing.');
  const correction: PositionImportAttempt = {
    input,
    requestId: crypto.randomUUID(),
    session: original.session,
    draft: true,
  };
  saveJournal({
    ...journal,
    attempts: [
      ...journal.attempts.map((saved) =>
        saved.requestId === original.requestId ? { ...saved, superseded: true } : saved
      ),
      { input, requestId: correction.requestId, draft: true },
    ],
  });
  pendingImports.get(original.session)?.delete(original.input);
  return correction;
}

export function confirmPositionImport(attempt: PositionImportAttempt): void {
  if (!isAuthSessionCurrent(attempt.session)) return;
  const journal = readJournal(attempt.session);
  saveJournal({
    ...journal,
    attempts: journal.attempts.filter((saved) => saved.requestId !== attempt.requestId),
  });
  const pending = pendingImports.get(attempt.session);
  if (pending?.get(attempt.input) === attempt) pending.delete(attempt.input);
}

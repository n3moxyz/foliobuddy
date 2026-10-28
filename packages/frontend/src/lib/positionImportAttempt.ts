import { captureAuthSession, type AuthSession } from './authSession';

export interface PositionImportAttempt {
  input: string;
  requestId: string;
  session: AuthSession;
}

// Keep uncertain imports through dialog unmounts within this auth session. A full
// acknowledgement releases the identity so a later identical import is intentional.
// Nothing is written to browser storage or shared between authenticated sessions.
const pendingImports = new WeakMap<AuthSession, Map<string, PositionImportAttempt>>();

export function beginPositionImport(input: string): PositionImportAttempt {
  const session = captureAuthSession();
  let pending = pendingImports.get(session);
  if (!pending) {
    pending = new Map();
    pendingImports.set(session, pending);
  }
  let attempt = pending.get(input);
  if (!attempt) {
    attempt = { input, requestId: crypto.randomUUID(), session };
    pending.set(input, attempt);
  }
  return attempt;
}

export function confirmPositionImport(attempt: PositionImportAttempt): void {
  const pending = pendingImports.get(attempt.session);
  if (pending?.get(attempt.input) === attempt) pending.delete(attempt.input);
}

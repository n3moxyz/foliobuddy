import { ApiError } from './apiError';

/** The style guide's next step for connection and server faults. */
export const CONNECTION_HINT = 'Check your connection and try again.';

/** Only for a mutation that names no action of its own; every current action sets one. */
export const DEFAULT_FAILURE_TITLE = "Couldn't complete that action";

/**
 * Failure feedback for a mutation. The style guide asks each failed save or delete to
 * name its action, with one message per failure.
 */
export interface MutationFeedbackMeta extends Record<string, unknown> {
  /** Toast title that names the failed action, for example "Couldn't delete trade". */
  failureTitle?: string;
  /** The calling form shows the error itself, so the global toast stays quiet. */
  showsOwnError?: boolean;
}

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: MutationFeedbackMeta;
  }
}

/**
 * Description for a failed action: the server's own reason when it gave one, otherwise
 * the connection hint for network failures, proxies and server errors.
 */
export function failureDescription(error: unknown): string {
  if (error instanceof ApiError) return error.status >= 500 ? CONNECTION_HINT : error.message;
  // fetch() rejects with a TypeError when the network or the API is unreachable
  // ("Failed to fetch" in Chrome, "Load failed" in Safari).
  if (error instanceof TypeError) return CONNECTION_HINT;
  return error instanceof Error && error.message ? error.message : CONNECTION_HINT;
}

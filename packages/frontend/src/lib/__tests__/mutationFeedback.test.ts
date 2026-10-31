import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { ApiError } from '../apiError';
import { endAuthSession, installAuthSession, type AuthSession } from '../authSession';
import { CONNECTION_HINT, DEFAULT_FAILURE_TITLE, failureDescription } from '../mutationFeedback';
import { createSessionQueryClient } from '../queryClient';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('failureDescription', () => {
  it('keeps the server reason for client errors', () => {
    expect(failureDescription(new ApiError('Trade not found', 404))).toBe('Trade not found');
    expect(failureDescription(new ApiError('Total stake percentage cannot exceed 100%', 400))).toBe(
      'Total stake percentage cannot exceed 100%'
    );
  });

  it('uses the connection hint for network failures and server faults', () => {
    expect(failureDescription(new TypeError('Failed to fetch'))).toBe(CONNECTION_HINT);
    expect(failureDescription(new TypeError('Load failed'))).toBe(CONNECTION_HINT);
    expect(failureDescription(new ApiError('Request failed (HTTP 502)', 502))).toBe(
      CONNECTION_HINT
    );
    expect(failureDescription(new ApiError('Internal server error', 500))).toBe(CONNECTION_HINT);
    expect(failureDescription('not an error')).toBe(CONNECTION_HINT);
  });

  it('keeps the message of other errors', () => {
    expect(failureDescription(new Error('Native cost support is not ready.'))).toBe(
      'Native cost support is not ready.'
    );
  });
});

describe('global mutation failure toast', () => {
  let session: AuthSession;

  afterEach(() => {
    endAuthSession(session);
    vi.clearAllMocks();
  });

  async function fail(meta: Record<string, unknown> | undefined, error: unknown) {
    session = installAuthSession('user_1', 'session_1', async () => null, 'local');
    const client = createSessionQueryClient(session);
    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => Promise.reject(error),
      meta,
    });
    await mutation.execute(undefined).catch(() => {});
  }

  it('names the failed action and gives the server reason', async () => {
    await fail({ failureTitle: "Couldn't delete trade" }, new ApiError('Trade not found', 404));

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("Couldn't delete trade", {
      description: 'Trade not found',
    });
  });

  it('turns a network failure into the connection hint, never "Failed to fetch"', async () => {
    await fail({ failureTitle: "Couldn't delete trade" }, new TypeError('Failed to fetch'));

    expect(toast.error).toHaveBeenCalledWith("Couldn't delete trade", {
      description: CONNECTION_HINT,
    });
  });

  it('stays quiet when the form shows the error itself', async () => {
    await fail({ showsOwnError: true }, new ApiError('Exit date cannot precede entry date', 400));

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('falls back to a neutral title for a mutation that names no action', async () => {
    await fail(undefined, new ApiError('Validation error', 400));

    expect(toast.error).toHaveBeenCalledWith(DEFAULT_FAILURE_TITLE, {
      description: 'Validation error',
    });
  });
});

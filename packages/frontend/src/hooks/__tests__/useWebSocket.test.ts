import { renderHook, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWebSocket } from '@/hooks/useWebSocket';

const mocks = vi.hoisted(() => {
  const invalidateQueriesMock = vi.fn();
  return {
    ioMock: vi.fn(),
    useAuthMock: vi.fn(),
    invalidateQueriesMock,
    useQueryClientMock: vi.fn(() => ({ invalidateQueries: invalidateQueriesMock })),
  };
});

vi.mock('socket.io-client', () => ({
  io: mocks.ioMock,
}));

vi.mock('@clerk/clerk-react', () => ({
  useAuth: mocks.useAuthMock,
}));

vi.mock('@tanstack/react-query', async () => {
  const actual =
    await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: mocks.useQueryClientMock,
  };
});

type SocketHandlers = Record<string, (...args: unknown[]) => void>;

describe('useWebSocket', () => {
  let handlers: SocketHandlers;
  let socketMock: { on: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    handlers = {};
    socketMock = {
      on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
        handlers[event] = callback;
        return socketMock;
      }),
      disconnect: vi.fn(),
    };

    mocks.ioMock.mockReset();
    mocks.useAuthMock.mockReset();
    mocks.invalidateQueriesMock.mockReset();
    mocks.useQueryClientMock.mockClear();
    mocks.ioMock.mockReturnValue(socketMock);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connects when user is signed in', async () => {
    const getToken = vi.fn().mockResolvedValue('test-token');
    mocks.useAuthMock.mockReturnValue({ isSignedIn: true, getToken });

    const { result } = renderHook(() => useWebSocket());

    await waitFor(() => expect(mocks.ioMock).toHaveBeenCalled());

    act(() => {
      handlers.connect();
    });

    await waitFor(() => expect(result.current.status).toBe('connected'));
  });

  it('does not connect when user is not signed in', async () => {
    mocks.useAuthMock.mockReturnValue({ isSignedIn: false, getToken: vi.fn() });

    const { result } = renderHook(() => useWebSocket());

    await waitFor(() => expect(result.current.status).toBe('disconnected'));
    expect(mocks.ioMock).not.toHaveBeenCalled();
  });

  it('updates status on disconnect event', async () => {
    const getToken = vi.fn().mockResolvedValue('test-token');
    mocks.useAuthMock.mockReturnValue({ isSignedIn: true, getToken });

    const { result } = renderHook(() => useWebSocket());

    await waitFor(() => expect(mocks.ioMock).toHaveBeenCalled());

    act(() => {
      handlers.connect();
    });

    await waitFor(() => expect(result.current.status).toBe('connected'));

    act(() => {
      handlers.disconnect();
    });

    await waitFor(() => expect(result.current.status).toBe('disconnected'));
  });

  it('updates status during reconnect lifecycle events', async () => {
    const getToken = vi.fn().mockResolvedValue('test-token');
    mocks.useAuthMock.mockReturnValue({ isSignedIn: true, getToken });

    const { result } = renderHook(() => useWebSocket());

    await waitFor(() => expect(mocks.ioMock).toHaveBeenCalled());

    act(() => {
      handlers.connect();
    });

    await waitFor(() => expect(result.current.status).toBe('connected'));

    act(() => {
      handlers.reconnecting();
    });

    await waitFor(() => expect(result.current.status).toBe('connecting'));

    act(() => {
      handlers.reconnect();
    });

    await waitFor(() => expect(result.current.status).toBe('connected'));
  });

  it('invalidates queries when prices are updated', async () => {
    const getToken = vi.fn().mockResolvedValue('test-token');
    mocks.useAuthMock.mockReturnValue({ isSignedIn: true, getToken });

    const { result } = renderHook(() => useWebSocket());

    await waitFor(() => expect(mocks.ioMock).toHaveBeenCalled());

    const timestamp = '2026-01-01T12:00:00.000Z';

    act(() => {
      handlers['prices:updated']({ timestamp, pricesUpdated: 10 });
    });

    await waitFor(() => {
      expect(result.current.lastUpdate?.toISOString()).toBe(timestamp);
    });

    expect(mocks.invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['portfolio'] });
    expect(mocks.invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['positions'] });
    expect(mocks.invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['prices'] });
    // ['dashboard'] was removed — no query uses that key; invalidating it was dead work.
    expect(mocks.invalidateQueriesMock).not.toHaveBeenCalledWith({ queryKey: ['dashboard'] });
  });

  it('invalidates portfolio, positions, and snapshots when the portfolio is updated', async () => {
    const getToken = vi.fn().mockResolvedValue('test-token');
    mocks.useAuthMock.mockReturnValue({ isSignedIn: true, getToken });

    const { result } = renderHook(() => useWebSocket());

    await waitFor(() => expect(mocks.ioMock).toHaveBeenCalled());

    const timestamp = '2026-01-01T12:00:00.000Z';

    act(() => {
      handlers['portfolio:updated']({ timestamp, userId: 'user-1' });
    });

    await waitFor(() => {
      expect(result.current.lastUpdate?.toISOString()).toBe(timestamp);
    });

    expect(mocks.invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['portfolio'] });
    expect(mocks.invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['positions'] });
    expect(mocks.invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['snapshots'] });
  });
});

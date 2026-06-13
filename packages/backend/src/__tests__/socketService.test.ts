import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { socketService } from '../services/socketService.js';

const mocks = vi.hoisted(() => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../lib/logger.js', () => ({ logger: mocks.logger }));

interface FakeRoom {
  emit: ReturnType<typeof vi.fn>;
}

interface FakeIo {
  emit: ReturnType<typeof vi.fn>;
  to: ReturnType<typeof vi.fn>;
  engine: { clientsCount: number };
}

function setSocketIo(io: FakeIo | null): void {
  (socketService as unknown as { io: FakeIo | null }).io = io;
}

describe('socketService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSocketIo(null);
  });

  afterEach(() => {
    setSocketIo(null);
  });

  it('is a no-op before Socket.io is initialized', () => {
    expect(() => socketService.broadcastPriceUpdate(1)).not.toThrow();
    expect(() => socketService.broadcastPortfolioUpdate('user-1')).not.toThrow();
    expect(socketService.getConnectedCount()).toBe(0);
  });

  it('broadcasts price updates to all clients', () => {
    const fakeIo: FakeIo = {
      emit: vi.fn(),
      to: vi.fn(),
      engine: { clientsCount: 3 },
    };
    setSocketIo(fakeIo);

    socketService.broadcastPriceUpdate(4);

    expect(fakeIo.emit).toHaveBeenCalledWith(
      'prices:updated',
      expect.objectContaining({
        pricesUpdated: 4,
        timestamp: expect.any(String),
      })
    );
    expect(socketService.getConnectedCount()).toBe(3);
  });

  it('broadcasts portfolio updates only to the user room', () => {
    const room: FakeRoom = { emit: vi.fn() };
    const fakeIo: FakeIo = {
      emit: vi.fn(),
      to: vi.fn(() => room),
      engine: { clientsCount: 1 },
    };
    setSocketIo(fakeIo);

    socketService.broadcastPortfolioUpdate('user-1');

    expect(fakeIo.to).toHaveBeenCalledWith('user:user-1');
    expect(room.emit).toHaveBeenCalledWith(
      'portfolio:updated',
      expect.objectContaining({
        userId: 'user-1',
        timestamp: expect.any(String),
      })
    );
    expect(fakeIo.emit).not.toHaveBeenCalled();
  });
});

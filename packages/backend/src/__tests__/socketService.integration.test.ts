import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { socketService } from '../services/socketService.js';

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@clerk/express', () => ({ verifyToken: mocks.verifyToken }));
vi.mock('../lib/logger.js', () => ({ logger: mocks.logger }));

function listen(server: HttpServer): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function connectClient(port: number, token?: string): Promise<ClientSocket> {
  const socket = createClient(`http://127.0.0.1:${port}`, {
    auth: token ? { token } : {},
    transports: ['websocket'],
    forceNew: true,
    timeout: 1000,
    extraHeaders: { Origin: 'http://localhost:4000' },
  });

  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => {
      socket.close();
      reject(error);
    });
  });
}

function waitForEvent<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 1000);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function waitForConnectedCount(count: number): Promise<void> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (socketService.getConnectedCount() === count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(socketService.getConnectedCount()).toBe(count);
}

describe('socketService integration', () => {
  let httpServer: HttpServer;
  let clients: ClientSocket[];
  let originalClerkSecret: string | undefined;

  beforeEach(() => {
    httpServer = createServer();
    clients = [];
    originalClerkSecret = process.env.CLERK_SECRET_KEY;
    process.env.CLERK_SECRET_KEY = 'test-clerk-secret';
    mocks.verifyToken.mockReset();
    mocks.verifyToken.mockImplementation(async (token: string) => ({ sub: token }));
  });

  afterEach(async () => {
    for (const client of clients) client.close();
    socketService.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    if (originalClerkSecret === undefined) {
      delete process.env.CLERK_SECRET_KEY;
    } else {
      process.env.CLERK_SECRET_KEY = originalClerkSecret;
    }
  });

  it('authenticates sockets, broadcasts price updates, and scopes portfolio updates to user rooms', async () => {
    socketService.initialize(httpServer, ['http://localhost:4000']);
    const port = await listen(httpServer);

    const userOne = await connectClient(port, 'user-1');
    const userTwo = await connectClient(port, 'user-2');
    clients.push(userOne, userTwo);

    expect(mocks.verifyToken).toHaveBeenCalledWith('user-1', {
      secretKey: 'test-clerk-secret',
    });
    expect(mocks.verifyToken).toHaveBeenCalledWith('user-2', {
      secretKey: 'test-clerk-secret',
    });
    expect(socketService.getConnectedCount()).toBe(2);

    const userOnePrice = waitForEvent<{ pricesUpdated: number }>(userOne, 'prices:updated');
    const userTwoPrice = waitForEvent<{ pricesUpdated: number }>(userTwo, 'prices:updated');
    socketService.broadcastPriceUpdate(7);

    await expect(userOnePrice).resolves.toEqual(
      expect.objectContaining({ pricesUpdated: 7, timestamp: expect.any(String) })
    );
    await expect(userTwoPrice).resolves.toEqual(
      expect.objectContaining({ pricesUpdated: 7, timestamp: expect.any(String) })
    );

    const userOnePortfolio = waitForEvent<{ userId: string }>(userOne, 'portfolio:updated');
    let userTwoReceivedPortfolio = false;
    userTwo.once('portfolio:updated', () => {
      userTwoReceivedPortfolio = true;
    });

    socketService.broadcastPortfolioUpdate('user-1');

    await expect(userOnePortfolio).resolves.toEqual(
      expect.objectContaining({ userId: 'user-1', timestamp: expect.any(String) })
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(userTwoReceivedPortfolio).toBe(false);
  });

  it('rejects unauthenticated socket connections', async () => {
    socketService.initialize(httpServer, ['http://localhost:4000']);
    const port = await listen(httpServer);

    await expect(connectClient(port)).rejects.toThrow(/Authentication required/);
    await waitForConnectedCount(0);
  });
});

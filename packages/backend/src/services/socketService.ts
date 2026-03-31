import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyToken } from '@clerk/express';
import { logger } from '../lib/logger.js';

interface PriceUpdate {
  timestamp: string;
  pricesUpdated: number;
}

interface PortfolioUpdate {
  timestamp: string;
  userId: string;
}

class SocketService {
  private io: Server | null = null;

  /**
   * Initialize Socket.io server with Clerk JWT authentication
   */
  initialize(httpServer: HttpServer, allowedOrigins: string[]): void {
    this.io = new Server(httpServer, {
      cors: {
        origin: (origin, callback) => {
          if (!origin) return callback(null, true);
          if (allowedOrigins.some((allowed) => origin === allowed || allowed === '*')) {
            return callback(null, true);
          }
          callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    // Middleware to verify Clerk JWT on connection
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;

        if (!token) {
          return next(new Error('Authentication required'));
        }

        // Verify the Clerk JWT
        const secretKey = process.env.CLERK_SECRET_KEY;
        if (!secretKey) {
          return next(new Error('Server configuration error'));
        }

        const verified = await verifyToken(token, {
          secretKey,
        });

        if (!verified || !verified.sub) {
          return next(new Error('Invalid token'));
        }

        // Attach userId to socket for later use
        socket.data.userId = verified.sub;
        next();
      } catch (error) {
        logger.error('[WebSocket] Auth error:', error);
        next(new Error('Authentication failed'));
      }
    });

    // Handle connections
    this.io.on('connection', (socket: Socket) => {
      const userId = socket.data.userId;
      logger.info(`[WebSocket] Client connected: ${userId}`);

      // Join user-specific room
      socket.join(`user:${userId}`);

      socket.on('disconnect', () => {
        logger.info(`[WebSocket] Client disconnected: ${userId}`);
      });
    });

    logger.info('[WebSocket] Socket.io server initialized');
  }

  /**
   * Broadcast price update to all connected clients
   */
  broadcastPriceUpdate(pricesUpdated: number): void {
    if (!this.io) return;

    const update: PriceUpdate = {
      timestamp: new Date().toISOString(),
      pricesUpdated,
    };

    this.io.emit('prices:updated', update);
    logger.info(`[WebSocket] Broadcast prices:updated to all clients`);
  }

  /**
   * Send portfolio update to a specific user
   */
  broadcastPortfolioUpdate(userId: string): void {
    if (!this.io) return;

    const update: PortfolioUpdate = {
      timestamp: new Date().toISOString(),
      userId,
    };

    this.io.to(`user:${userId}`).emit('portfolio:updated', update);
    logger.info(`[WebSocket] Sent portfolio:updated to user ${userId}`);
  }

  /**
   * Get connected client count
   */
  getConnectedCount(): number {
    return this.io?.engine?.clientsCount ?? 0;
  }
}

export const socketService = new SocketService();

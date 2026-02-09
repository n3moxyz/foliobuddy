import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@clerk/clerk-react';
import { useQueryClient } from '@tanstack/react-query';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

interface PriceUpdate {
  timestamp: string;
  pricesUpdated: number;
}

interface PortfolioUpdate {
  timestamp: string;
  userId: string;
}

interface UseWebSocketReturn {
  status: ConnectionStatus;
  lastUpdate: Date | null;
}

export function useWebSocket(): UseWebSocketReturn {
  const { getToken, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const connect = useCallback(async () => {
    if (!isSignedIn) return;

    try {
      const token = await getToken();
      if (!token) {
        console.log('[WebSocket] No auth token available');
        return;
      }

      // In production, connect directly to Railway backend (Vercel doesn't proxy WebSockets)
      // In development, connect to local backend
      // Use VITE_WS_BACKEND_URL env var for production backend, fallback to default Railway URL
      const RAILWAY_BACKEND = import.meta.env.VITE_WS_BACKEND_URL || 'https://empowering-curiosity-production-9eff.up.railway.app';
      const apiBase = import.meta.env.DEV ? (import.meta.env.VITE_WS_BACKEND_URL || 'http://localhost:4001') : RAILWAY_BACKEND;

      setStatus('connecting');

      const socket = io(apiBase, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      socket.on('connect', () => {
        console.log('[WebSocket] Connected');
        setStatus('connected');
      });

      socket.on('disconnect', () => {
        console.log('[WebSocket] Disconnected');
        setStatus('disconnected');
      });

      socket.on('connect_error', (error) => {
        console.log('[WebSocket] Connection error:', error.message);
        setStatus('disconnected');
      });

      socket.on('reconnecting', () => {
        console.log('[WebSocket] Reconnecting...');
        setStatus('connecting');
      });

      socket.on('reconnect', () => {
        console.log('[WebSocket] Reconnected');
        setStatus('connected');
      });

      // Handle price updates - invalidate all price-related queries
      socket.on('prices:updated', (data: PriceUpdate) => {
        console.log('[WebSocket] Prices updated:', data);
        setLastUpdate(new Date(data.timestamp));

        // Invalidate queries to trigger refetch with fresh data
        queryClient.invalidateQueries({ queryKey: ['portfolio'] });
        queryClient.invalidateQueries({ queryKey: ['positions'] });
        queryClient.invalidateQueries({ queryKey: ['prices'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      });

      // Handle portfolio updates - user-specific data
      socket.on('portfolio:updated', (data: PortfolioUpdate) => {
        console.log('[WebSocket] Portfolio updated:', data);
        setLastUpdate(new Date(data.timestamp));

        // Invalidate user-specific queries
        queryClient.invalidateQueries({ queryKey: ['portfolio'] });
        queryClient.invalidateQueries({ queryKey: ['positions'] });
        queryClient.invalidateQueries({ queryKey: ['snapshots'] });
      });

      socketRef.current = socket;
    } catch (error) {
      console.error('[WebSocket] Setup error:', error);
      setStatus('disconnected');
    }
  }, [isSignedIn, getToken, queryClient]);

  useEffect(() => {
    connect();

    return () => {
      if (socketRef.current) {
        console.log('[WebSocket] Cleaning up connection');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [connect]);

  return { status, lastUpdate };
}

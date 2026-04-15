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
      if (!token) return;

      // Vercel doesn't proxy WebSockets — connect directly to backend
      const wsBackendUrl = import.meta.env.VITE_WS_BACKEND_URL;
      if (!import.meta.env.DEV && !wsBackendUrl) {
        console.warn('[WebSocket] VITE_WS_BACKEND_URL not set — WebSocket disabled in production');
        return;
      }
      const apiBase = wsBackendUrl || 'http://localhost:4001';

      setStatus('connecting');

      const socket = io(apiBase, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });

      socket.on('connect', () => setStatus('connected'));
      socket.on('disconnect', () => setStatus('disconnected'));
      socket.on('connect_error', () => setStatus('disconnected'));
      socket.on('reconnecting', () => setStatus('connecting'));
      socket.on('reconnect', () => setStatus('connected'));

      socket.on('prices:updated', (data: PriceUpdate) => {
        setLastUpdate(new Date(data.timestamp));
        queryClient.invalidateQueries({ queryKey: ['portfolio'] });
        queryClient.invalidateQueries({ queryKey: ['positions'] });
        queryClient.invalidateQueries({ queryKey: ['prices'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      });

      socket.on('portfolio:updated', (data: PortfolioUpdate) => {
        setLastUpdate(new Date(data.timestamp));
        queryClient.invalidateQueries({ queryKey: ['portfolio'] });
        queryClient.invalidateQueries({ queryKey: ['positions'] });
        queryClient.invalidateQueries({ queryKey: ['snapshots'] });
      });

      socketRef.current = socket;
    } catch {
      setStatus('disconnected');
    }
  }, [isSignedIn, getToken, queryClient]);

  useEffect(() => {
    connect();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [connect]);

  return { status, lastUpdate };
}

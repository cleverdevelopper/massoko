import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { getAccessToken, subscribeToTokenChanges } from '../utils/tokenStorage';

const SOCKET_URL = process.env.EXPO_PUBLIC_SERVER_URI || '';

export function useSocket() {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  const connect = useCallback((token: string) => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    socketRef.current = io(SOCKET_URL, {
      auth: {
        token: token,
      },
      transports: ['websocket'],
    });

    socketRef.current.on('connect', () => {
      console.log('Socket connected:', socketRef.current?.id);
    });

    return socketRef.current;
  }, []);

  useEffect(() => {
    // Initial connection if token exists
    const token = getAccessToken();
    if (token && user) {
      connect(token);
    }

    // Subscribe to token changes (auto-refresh or login/logout)
    const unsubscribe = subscribeToTokenChanges((newToken) => {
      if (newToken && user) {
        if (!socketRef.current) {
          connect(newToken);
        } else {
          socketRef.current.auth = { token: newToken };
          socketRef.current.disconnect().connect();
        }
      } else if (!newToken && socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    });

    return () => {
      unsubscribe();
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user, connect]);

  return {
    socket: socketRef.current,
  };
}

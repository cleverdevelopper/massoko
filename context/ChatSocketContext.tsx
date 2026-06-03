/**
 * ChatSocketContext.tsx
 *
 * Changes from original:
 * - sendMessage now accepts signal_message_type explicitly and passes it through.
 * - On socket reconnect, drains the outgoing_message_queue from SQLite.
 * - markAsRead now accepts device_id (sent from app_settings).
 */
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { MessageRepository } from '@/utils/repositories/MessageRepository';
import { getSetting } from '@/utils/database';

interface ChatSocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  joinConversation: (conversationId: string | number) => void;
  leaveConversation: (conversationId: string | number) => void;
  sendMessage: (conversationId: string | number, content: string, signalMessageType: number) => void;
  markAsRead: (conversationId: string | number) => void;
  sendTypingStart: (conversationId: string | number) => void;
  sendTypingStop: (conversationId: string | number) => void;
}

const ChatSocketContext = createContext<ChatSocketContextType | undefined>(undefined);

export function ChatSocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const deviceIdRef = useRef<number>(1);

  const getAccessToken = async () => {
    return await SecureStore.getItemAsync('access_token');
  };

  // Drain any pending outgoing messages queued while offline
  const drainOutgoingQueue = async (s: Socket) => {
    try {
      const pending = await MessageRepository.getPendingQueue();
      for (const item of pending) {
        s.emit('send_message', {
          conversation_id: item.conversation_id,
          content: item.encrypted_content,
          message_type: 'text',
          signal_message_type: item.signal_message_type,
        });
        await MessageRepository.removeFromQueue(item.local_id);
      }
      if (pending.length > 0) {
        console.log(`[Socket] Drained ${pending.length} queued messages.`);
      }
    } catch (e) {
      console.error('[Socket] Failed to drain queue:', e);
    }
  };

  const connectSocket = async () => {
    const token = await getAccessToken();
    if (!token) return;

    const storedDeviceId = await getSetting('device_id');
    const deviceId = storedDeviceId ? parseInt(storedDeviceId, 10) : 1;
    deviceIdRef.current = deviceId;

    const serverUri = process.env.EXPO_PUBLIC_SERVER_URI || '';
    const ipMatch = serverUri.match(/\/\/(.*?):/);
    const ip = ipMatch ? ipMatch[1] : 'localhost';

    const socketInstance = io(`http://${ip}:3000`, {
      auth: { token, device_id: deviceId },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
    });

    socketInstance.on('connect', async () => {
      console.log('[Socket] Connected');
      setIsConnected(true);
      await drainOutgoingQueue(socketInstance);
    });

    socketInstance.on('disconnect', () => {
      console.log('[Socket] Disconnected');
      setIsConnected(false);
    });

    socketInstance.on('reconnect', async () => {
      console.log('[Socket] Reconnected');
      setIsConnected(true);
      await drainOutgoingQueue(socketInstance);
    });

    socketRef.current = socketInstance;
    setSocket(socketInstance);
    return socketInstance;
  };

  useEffect(() => {
    connectSocket();
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const joinConversation = (conversationId: string | number) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('join_conversation', conversationId);
    }
  };

  const leaveConversation = (conversationId: string | number) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('leave_conversation', conversationId);
    }
  };

  /**
   * Send an encrypted message via socket.
   * signal_message_type MUST be passed — never default to a magic number here.
   */
  const sendMessage = (
    conversationId: string | number,
    content: string,
    signalMessageType: number
  ) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('send_message', {
        conversation_id: conversationId,
        content,
        message_type: 'text',
        signal_message_type: signalMessageType,
      });
    }
  };

  const markAsRead = (conversationId: string | number) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('mark_as_read', {
        conversation_id: conversationId,
        device_id: deviceIdRef.current,
      });
    }
  };

  const sendTypingStart = (conversationId: string | number) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('typing_start', { conversation_id: conversationId });
    }
  };

  const sendTypingStop = (conversationId: string | number) => {
    if (socketRef.current && isConnected) {
      socketRef.current.emit('typing_stop', { conversation_id: conversationId });
    }
  };

  return (
    <ChatSocketContext.Provider
      value={{
        socket,
        isConnected,
        joinConversation,
        leaveConversation,
        sendMessage,
        markAsRead,
        sendTypingStart,
        sendTypingStop,
      }}
    >
      {children}
    </ChatSocketContext.Provider>
  );
}

export const useChatSocket = () => {
  const ctx = useContext(ChatSocketContext);
  if (!ctx) throw new Error('useChatSocket must be used within ChatSocketProvider');
  return ctx;
};

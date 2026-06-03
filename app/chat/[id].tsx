/**
 * app/chat/[id].tsx
 *
 * CRITICAL DECRYPTION RULES:
 * ─────────────────────────────────────────────────────────────────────
 * 1. When a message arrives (socket or API), try to look it up in local_messages
 *    by server_message_id.
 * 2. If decrypted_content already exists → show it immediately, DO NOT decrypt.
 * 3. If decrypted_content is null → decrypt, then persist BOTH encrypted and
 *    decrypted content in local_messages. Future reads skip decryption entirely.
 * 4. Outgoing messages (sender === me) → store plaintext in local_messages
 *    immediately so they are always readable, no decryption needed.
 * 5. signal_message_type is captured from the embedded "type:body" prefix in
 *    encrypted_content and stored. It is NEVER discarded.
 * ─────────────────────────────────────────────────────────────────────
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  useSharedValue,
  withDelay,
} from 'react-native-reanimated';
import axiosInstance from '@/utils/axiosInstance';
import { useChatSocket } from '@/context/ChatSocketContext';
import { useAuth } from '@/context/AuthContext';
import { signalService } from '@/utils/signal/SignalService';
import { MessageRepository } from '@/utils/repositories/MessageRepository';

interface Message {
  id: string | number;
  text: string;
  sender: 'me' | 'other';
  time: string;
  status?: 'sent' | 'delivered' | 'read';
}

// ─── Typing Indicator ──────────────────────────────────────────────────────

const TypingIndicator = () => {
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);

  useEffect(() => {
    const animate = (val: any, delay: number) => {
      val.value = withDelay(
        delay,
        withRepeat(
          withSequence(withTiming(-6, { duration: 300 }), withTiming(0, { duration: 300 })),
          -1,
          false
        )
      );
    };
    animate(dot1, 0);
    animate(dot2, 150);
    animate(dot3, 300);
  }, []);

  const s1 = useAnimatedStyle(() => ({ transform: [{ translateY: dot1.value }] }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ translateY: dot2.value }] }));
  const s3 = useAnimatedStyle(() => ({ transform: [{ translateY: dot3.value }] }));

  return (
    <View style={[styles.messageWrapper, styles.otherMessageWrapper, { marginBottom: 10 }]}>
      <View style={[styles.messageBubble, styles.otherBubble, styles.typingBubble]}>
        <View style={styles.typingContainer}>
          <Animated.View style={[styles.typingDot, s1]} />
          <Animated.View style={[styles.typingDot, s2]} />
          <Animated.View style={[styles.typingDot, s3]} />
        </View>
      </View>
    </View>
  );
};

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Extract the embedded Signal type prefix from "type:base64" format.
 * Returns the numeric type and the raw base64 body separately.
 */
function parseSignalContent(content: string): { signalType: number | null; body: string } {
  const colonIdx = content.indexOf(':');
  if (colonIdx > 0 && colonIdx <= 2) {
    const prefix = content.substring(0, colonIdx);
    const parsed = parseInt(prefix, 10);
    if (!isNaN(parsed) && (parsed === 1 || parsed === 2 || parsed === 3)) {
      return { signalType: parsed, body: content.substring(colonIdx + 1) };
    }
  }
  return { signalType: null, body: content };
}

/**
 * Decrypt a message, storing the result in SQLite so it is never decrypted again.
 */
async function decryptAndPersist(
  senderId: string | number,
  serverMessageId: string | null,
  localRowId: number | null,
  encryptedContent: string,
  signalType: number
): Promise<string> {
  try {
    const plaintext = await signalService.decryptMessage(senderId, encryptedContent, signalType);
    // Persist immediately so subsequent reads skip decryption
    await MessageRepository.saveDecrypted(serverMessageId, localRowId, plaintext);
    return plaintext;
  } catch (e) {
    console.error(`[DECRYPT] Failed for sender ${senderId}:`, e);
    return '🔒 [Mensagem Encriptada]';
  }
}

function parseSentAt(sentAt: string | null | undefined): Date | null {
  if (!sentAt) return null;
  const sanitized = sentAt.includes(' ') && !sentAt.includes('T') ? sentAt.replace(' ', 'T') : sentAt;
  const d = new Date(sanitized);
  return isNaN(d.getTime()) ? null : d;
}

function formatMsgTime(sentAt?: string | null, timeStr?: string | null): string {
  const d = sentAt ? parseSentAt(sentAt) : null;
  if (d) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return timeStr || '';
}

// ─── Chat Screen ────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const router = useRouter();
  const { id, name, image, partnerId } = useLocalSearchParams();
  const { user: currentUser } = useAuth();
  const insets = useSafeAreaInsets();

  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState<Record<number, boolean>>({});

  const flatListRef = useRef<FlatList>(null);
  const isTypingRef = useRef(false);
  const lastTypingEventRef = useRef<number>(0);
  const stopTypingTimeoutRef = useRef<any>(null);

  const {
    socket,
    isConnected,
    joinConversation,
    leaveConversation,
    sendMessage,
    markAsRead,
    sendTypingStart,
    sendTypingStop,
  } = useChatSocket();

  const displayName = (name as string) || 'Conversa';
  const displayImage = (image as string) || null;
  const conversationId = id as string;

  // ── Load messages ────────────────────────────────────────────────────────

  const loadMessages = useCallback(async () => {
    if (!currentUser) return;
    try {
      // ── Step 1: Load cached messages from SQLite first ──────────────────
      const cached = await MessageRepository.getMessages(conversationId);
      if (cached.length > 0) {
        const formatted = cached.map((m) => ({
          id: m.server_message_id ?? m.id!,
          text: m.decrypted_content ?? m.encrypted_content,
          sender: (m.sender_id === String(currentUser.id) ? 'me' : 'other') as 'me' | 'other',
          time: formatMsgTime(m.sent_at),
          status: 'delivered' as const,
        }));
        // SQLite stores oldest-first. Reverse it to display newest-first in inverted FlatList.
        setMessages(formatted.reverse());
        setLoading(false);
      }

      // ── Step 2: Fetch fresh list from server ────────────────────────────
      const response = await axiosInstance.get(
        `/api/v1/messages?conversation_id=${conversationId}`
      );
      if (!response.data?.success) return;

      // Server returns newest-first. Reverse to process and decrypt oldest-first (ratchet order).
      const rawMsgs: any[] = [...response.data.messages].reverse();
      await MessageRepository.upsertConversation(conversationId, name as string, image as string);

      // Process sequentially — Signal ratchet requires sequential decryption
      const decryptedMsgs: Message[] = [];
      for (const msg of rawMsgs) {
        const isMe =
          msg.sender === 'me' || Number(msg.sender_id) === Number(currentUser.id);
        const serverMsgId = String(msg.id);
        const rawContent: string = msg.content ?? msg.text ?? msg.encrypted_content ?? '';

        // ── Parse embedded signal type from "type:base64" prefix ──────────
        const { signalType: embeddedType } = parseSignalContent(rawContent);
        const signalType: number =
          embeddedType ??
          (msg.signal_message_type !== undefined
            ? Number(msg.signal_message_type)
            : 3);

        // ── Check local DB first ──────────────────────────────────────────
        const existing = await MessageRepository.getByServerId(serverMsgId);

        if (isMe) {
          // Outgoing — plaintext is the cached decrypted_content or a placeholder
          const displayText = existing?.decrypted_content ?? '🔒 [Mensagem enviada]';

          // Ensure row exists in DB
          if (!existing) {
            await MessageRepository.insertRaw({
              server_message_id: serverMsgId,
              conversation_id: conversationId,
              sender_id: String(currentUser.id),
              encrypted_content: rawContent,
              decrypted_content: displayText,
              signal_message_type: signalType,
              message_type: msg.type ?? msg.message_type ?? 'text',
              sent_at: msg.sent_at,
            });
          }

          decryptedMsgs.push({
            id: serverMsgId,
            text: displayText,
            sender: 'me',
            time: formatMsgTime(msg.sent_at, msg.time),
            status: 'delivered',
          });
        } else {
          // Incoming — prefer cached decrypted_content if available
          let displayText: string;

          if (existing?.decrypted_content) {
            // ✅ Already decrypted once — never decrypt again
            displayText = existing.decrypted_content;
          } else {
            // Persist raw message first so we have a local row
            const localRowId = existing
              ? existing.id!
              : await MessageRepository.insertRaw({
                  server_message_id: serverMsgId,
                  conversation_id: conversationId,
                  sender_id: String(msg.sender_id),
                  encrypted_content: rawContent,
                  decrypted_content: null,
                  signal_message_type: signalType,
                  message_type: msg.type ?? msg.message_type ?? 'text',
                  sent_at: msg.sent_at,
                });

            // Decrypt and persist
            displayText = await decryptAndPersist(
              msg.sender_id,
              serverMsgId,
              localRowId,
              rawContent,
              signalType
            );
          }

          decryptedMsgs.push({
            id: serverMsgId,
            text: displayText,
            sender: 'other',
            time: formatMsgTime(msg.sent_at, msg.time),
            status: 'sent',
          });
        }
      }

      // Reverse back to newest-first for the inverted FlatList view
      setMessages(decryptedMsgs.reverse());
    } catch (error) {
      console.error('[ChatScreen] Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  }, [conversationId, currentUser]);

  // ── Socket listeners ────────────────────────────────────────────────────

  useEffect(() => {
    if (!socket || !currentUser) return;

    joinConversation(conversationId);
    loadMessages();
    markAsRead(conversationId);

    const onReceiveMessage = async (msg: any) => {
      const isMe =
        Number(msg.sender_id) === Number(currentUser.id) || msg.sender === 'me';
      const serverMsgId = msg.id ? String(msg.id) : null;
      const rawContent: string = msg.content ?? msg.text ?? msg.encrypted_content ?? '';
      const { signalType: embeddedType } = parseSignalContent(rawContent);
      const signalType: number =
        embeddedType ??
        (msg.signal_message_type !== undefined ? Number(msg.signal_message_type) : 3);

      let displayText: string;

      if (isMe) {
        // Replace the optimistic message
        setMessages((prev) => {
          const optimistic = prev.find((m) => m.sender === 'me' && m.status === 'sent');
          if (optimistic && serverMsgId) {
            // Persist with the optimistic plaintext
            MessageRepository.insertRaw({
              server_message_id: serverMsgId,
              conversation_id: conversationId,
              sender_id: String(currentUser.id),
              encrypted_content: rawContent,
              decrypted_content: optimistic.text,
              signal_message_type: signalType,
              message_type: msg.type ?? 'text',
              sent_at: msg.sent_at,
            }).catch(console.error);

            return prev.map((m) =>
              m.id === optimistic.id
                ? { ...m, id: serverMsgId ?? m.id, status: 'delivered' }
                : m
            );
          }
          return prev;
        });
        return;
      }

      // Incoming: check cache first
      const existing = serverMsgId
        ? await MessageRepository.getByServerId(serverMsgId)
        : null;

      if (existing?.decrypted_content) {
        displayText = existing.decrypted_content;
      } else {
        // Persist raw, then decrypt
        const localRowId = existing
          ? existing.id!
          : await MessageRepository.insertRaw({
              server_message_id: serverMsgId,
              conversation_id: conversationId,
              sender_id: String(msg.sender_id),
              encrypted_content: rawContent,
              decrypted_content: null,
              signal_message_type: signalType,
              message_type: msg.type ?? 'text',
              sent_at: msg.sent_at,
            });

        displayText = await decryptAndPersist(
          msg.sender_id,
          serverMsgId,
          localRowId,
          rawContent,
          signalType
        );
      }

      const formatted: Message = {
        id: serverMsgId ?? `${Date.now()}-${Math.random()}`,
        text: displayText,
        sender: 'other',
        time: formatMsgTime(msg.sent_at, msg.time) || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'sent',
      };

      setMessages((prev) => {
        // De-duplicate
        if (serverMsgId && prev.some((m) => m.id === serverMsgId)) return prev;
        return [formatted, ...prev];
      });

      // Clear typing indicator for sender
      setTypingUsers((prev) => {
        const copy = { ...prev };
        delete copy[msg.sender_id];
        return copy;
      });
      markAsRead(conversationId);
    };

    const onMessagesRead = (data: any) => {
      if (String(data.conversation_id) === conversationId) {
        setMessages((prev) =>
          prev.map((m) => ({ ...m, status: m.sender === 'me' ? 'read' : m.status }))
        );
      }
    };

    const onUserTyping = (data: any) => {
      if (String(data.conversation_id) === conversationId && data.user_id !== currentUser.id) {
        setTypingUsers((prev) => ({ ...prev, [data.user_id]: true }));
      }
    };

    const onUserStopTyping = (data: any) => {
      if (String(data.conversation_id) === conversationId) {
        setTypingUsers((prev) => {
          const copy = { ...prev };
          delete copy[data.user_id];
          return copy;
        });
      }
    };

    socket.on('receive_message', onReceiveMessage);
    socket.on('messages_read', onMessagesRead);
    socket.on('user_typing', onUserTyping);
    socket.on('user_stop_typing', onUserStopTyping);

    return () => {
      socket.off('receive_message', onReceiveMessage);
      socket.off('messages_read', onMessagesRead);
      socket.off('user_typing', onUserTyping);
      socket.off('user_stop_typing', onUserStopTyping);
      leaveConversation(conversationId);
      if (isTypingRef.current) sendTypingStop(conversationId);
    };
  }, [conversationId, socket, isConnected, currentUser]);

  // ── Typing ──────────────────────────────────────────────────────────────

  const handleTextChange = (text: string) => {
    setMessageText(text);
    if (!isConnected) return;

    const now = Date.now();
    if (!isTypingRef.current || now - lastTypingEventRef.current > 1500) {
      isTypingRef.current = true;
      lastTypingEventRef.current = now;
      sendTypingStart(conversationId);
    }

    if (stopTypingTimeoutRef.current) clearTimeout(stopTypingTimeoutRef.current);
    stopTypingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        sendTypingStop(conversationId);
      }
    }, 2000);
  };

  // ── Send ────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!messageText.trim()) return;

    const content = messageText.trim();
    const tempId = `temp-${Date.now()}`;
    setMessageText('');

    if (isTypingRef.current) {
      isTypingRef.current = false;
      sendTypingStop(conversationId);
    }
    if (stopTypingTimeoutRef.current) clearTimeout(stopTypingTimeoutRef.current);

    // Optimistic UI
    const optimistic: Message = {
      id: tempId,
      text: content,
      sender: 'me',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'sent',
    };
    setMessages((prev) => [optimistic, ...prev]);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });

    try {
      const targetPartnerId = (partnerId as string) || conversationId;
      const encrypted = await signalService.encryptMessage(targetPartnerId, content);

      if (isConnected) {
        sendMessage(conversationId, encrypted.body, encrypted.type);
      } else {
        // Queue for later delivery
        await MessageRepository.enqueue(tempId, conversationId, encrypted.body, encrypted.type);
      }

      // Persist outgoing plaintext immediately so it is always readable
      await MessageRepository.insertRaw({
        server_message_id: null, // will be updated when server responds via socket
        conversation_id: conversationId,
        sender_id: String(currentUser?.id),
        encrypted_content: encrypted.body,
        decrypted_content: content, // plaintext preserved for sender
        signal_message_type: encrypted.type,
        message_type: 'text',
        sent_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[SEND] Encryption failed:', e);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMe = item.sender === 'me';
    const prev = messages[index - 1];
    const isSameSenderAsPrev = prev?.sender === item.sender;
    const isLastInGroup = !isSameSenderAsPrev;

    const renderStatus = () => {
      if (!isMe) return null;
      let iconName: any = 'checkmark';
      let iconColor = 'rgba(0,0,0,0.4)';
      if (item.status === 'read') { iconName = 'checkmark-done'; iconColor = '#34C759'; }
      else if (item.status === 'delivered') { iconName = 'checkmark-done'; }
      return <Ionicons name={iconName} size={15} color={iconColor} style={styles.checkIcon} />;
    };

    return (
      <View
        style={[
          styles.messageWrapper,
          isMe ? styles.myMessageWrapper : styles.otherMessageWrapper,
          { marginBottom: isSameSenderAsPrev ? 2 : 16 },
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            isMe ? styles.myBubble : styles.otherBubble,
            {
              borderBottomRightRadius: isMe && isLastInGroup ? 4 : 18,
              borderBottomLeftRadius: !isMe && isLastInGroup ? 4 : 18,
            },
          ]}
        >
          <View style={styles.bubbleContent}>
            <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.otherMessageText]}>
              {item.text}
            </Text>
            <View style={styles.bubbleStatusContainer}>
              <Text style={[styles.timeText, isMe ? styles.myTimeText : styles.otherTimeText]}>
                {item.time}
              </Text>
              {renderStatus()}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const isAnyoneTyping = Object.keys(typingUsers).length > 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      <View style={[styles.headerWrapper, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
          <View style={styles.userInfo}>
            <View style={styles.avatarContainer}>
              {displayImage ? (
                <Image source={{ uri: displayImage }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' }]}>
                  <Ionicons name="person" size={20} color="#8E8E93" />
                </View>
              )}
              <View style={[styles.statusDot, { backgroundColor: isConnected ? '#34C759' : '#FF9500' }]} />
            </View>
            <View>
              <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
              <Text style={styles.onlineStatus}>{isConnected ? 'Online' : 'Conectando...'}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.actionIcon}><Ionicons name="videocam-outline" size={22} color="#000" /></TouchableOpacity>
            <TouchableOpacity style={styles.actionIcon}><Ionicons name="call-outline" size={20} color="#000" /></TouchableOpacity>
            <TouchableOpacity style={styles.actionIcon}><Ionicons name="ellipsis-vertical" size={20} color="#000" /></TouchableOpacity>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}><ActivityIndicator size="large" color="#000" /></View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          inverted
          ListHeaderComponent={() => (isAnyoneTyping ? <TypingIndicator /> : null)}
          ListFooterComponent={() => (
            <View style={styles.dateSeparator}>
              <Text style={styles.dateText}>Início da conversa</Text>
            </View>
          )}
        />
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.footer}>
          <TouchableOpacity style={styles.addButton}>
            <Ionicons name="add" size={24} color="#000" />
          </TouchableOpacity>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Digite uma mensagem"
              value={messageText}
              onChangeText={handleTextChange}
              placeholderTextColor="#8E8E93"
            />
            <TouchableOpacity style={styles.inputIcon}>
              <Ionicons name="mic-outline" size={22} color="#8E8E93" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.sendButton, !messageText.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!messageText.trim()}
          >
            <Ionicons name="send" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      <View style={{ height: insets.bottom, backgroundColor: '#FFF' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  headerWrapper: { backgroundColor: '#FFF' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 60, backgroundColor: '#FFF', borderBottomWidth: 0.5, borderBottomColor: '#E0E0E0' },
  backButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  userInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarContainer: { position: 'relative', marginRight: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  statusDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: '#34C759', borderWidth: 2, borderColor: '#FFF' },
  userName: { fontSize: 16, fontWeight: '700', color: '#000' },
  onlineStatus: { fontSize: 11, color: '#8E8E93' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  actionIcon: { marginLeft: 15 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dateSeparator: { alignItems: 'center', marginVertical: 20 },
  dateText: { fontSize: 12, color: '#8E8E93', backgroundColor: '#E0E0E0', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, overflow: 'hidden' },
  messageList: { paddingHorizontal: 16, paddingBottom: 20 },
  messageWrapper: { marginBottom: 16, maxWidth: '85%' },
  myMessageWrapper: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  otherMessageWrapper: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  messageBubble: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 18 },
  myBubble: { backgroundColor: '#CCE4FF', borderBottomRightRadius: 4 },
  otherBubble: { backgroundColor: '#FFF', borderBottomLeftRadius: 4, borderWidth: 0.5, borderColor: '#E0E0E0' },
  messageText: { fontSize: 15, lineHeight: 20 },
  myMessageText: { color: '#000' },
  otherMessageText: { color: '#000' },
  bubbleContent: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'flex-end' },
  bubbleStatusContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, marginLeft: 12, marginBottom: -2 },
  timeText: { fontSize: 10, color: 'rgba(0,0,0,0.5)' },
  myTimeText: { color: 'rgba(0,0,0,0.5)' },
  otherTimeText: { color: 'rgba(0,0,0,0.4)' },
  checkIcon: { marginLeft: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFF', borderTopWidth: 0.5, borderTopColor: '#E0E0E0' },
  addButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  inputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 22, paddingHorizontal: 15, height: 40, marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: '#000', paddingVertical: 0 },
  inputIcon: { marginLeft: 5 },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: '#E0E0E0' },
  typingBubble: { paddingHorizontal: 12, paddingVertical: 12, minWidth: 60, height: 36, justifyContent: 'center' },
  typingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#8E8E93', marginHorizontal: 2 },
});

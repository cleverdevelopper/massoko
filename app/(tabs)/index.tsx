import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import axiosInstance from '@/utils/axiosInstance';
import { useFocusEffect } from '@react-navigation/native';
import { useChatSocket } from '@/context/ChatSocketContext';
import { useAuth } from '@/context/AuthContext';
import { getDB } from '@/utils/database';
import { MessageRepository } from '@/utils/repositories/MessageRepository';
import { signalService } from '@/utils/signal/SignalService';

function parseSignalContent(content: string): { signalType: number | null; body: string } {
  if (!content) return { signalType: null, body: '' };
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

interface Conversation {
  id: number;
  name: string;
  last_message: string;
  time: string;
  unread: number;
  image: string | null;
  other_user_id: number;
  phone: string;
  last_message_sender_id: number;
  last_message_status: 'sent' | 'delivered' | 'read' | null;
  isTyping?: boolean;
}

const STORIES = [
  { id: '1', name: 'Seu Status', image: null, isAdd: true },
  { id: '2', name: 'Terry', image: 'https://i.pravatar.cc/150?u=terry' },
  { id: '3', name: 'Craig', image: 'https://i.pravatar.cc/150?u=craig' },
  { id: '4', name: 'Roger', image: 'https://i.pravatar.cc/150?u=roger' },
  { id: '5', name: 'Nolan', image: 'https://i.pravatar.cc/150?u=nolan' },
  { id: '6', name: 'Sarah', image: 'https://i.pravatar.cc/150?u=sarah' },
];

const normalizePhone = (phone?: string) => {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 9 ? cleaned.slice(-9) : cleaned;
};

export default function ConversationsScreen() {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const { socket, isConnected, joinConversation, leaveConversation } = useChatSocket();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const conversationsRef = useRef<Conversation[]>([]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [contactMap, setContactMap] = useState<Record<string, string>>({});

  const loadDeviceContacts = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === 'granted') {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        });
        const map: Record<string, string> = {};
        data.forEach(contact => {
          contact.phoneNumbers?.forEach(p => {
            if (p.number) map[normalizePhone(p.number)] = contact.name;
          });
        });
        setContactMap(map);
      }
    } catch (error) {
      console.error('Error loading device contacts:', error);
    }
  };

  const processConversation = async (conv: any): Promise<Conversation> => {
    if (!currentUser) return conv;

    const db = getDB();
    let lastMessageText = conv.last_message;
    let lastMessageTime = conv.time;
    let lastMessageSenderId = conv.last_message_sender_id;
    let lastMessageStatus = conv.last_message_status;
    let messageId = null;
    let createdAt = null;

    if (conv.last_message) {
      // Try to find this message in local database by encrypted_content match
      const localMsg = await db.getFirstAsync<any>(
        `SELECT * FROM local_messages 
         WHERE conversation_id = ? AND encrypted_content = ? 
         LIMIT 1`,
        [String(conv.id), conv.last_message]
      );

      if (localMsg) {
        // ── Found in local DB ─────────────────────────────────────────────
        // CRITICAL: Never show ciphertext in conversation preview
        if (localMsg.decrypted_content) {
          lastMessageText = localMsg.decrypted_content;
        } else {
          // Should not happen after decryption fix, but handle safely
          console.log(`[CRITICAL] Local message ${localMsg.id} has no decrypted_content. Decrypting...`);
          try {
            const { signalType: embeddedType } = parseSignalContent(localMsg.encrypted_content);
            const signalType = embeddedType ?? localMsg.signal_message_type ?? 3;
            lastMessageText = await signalService.decryptMessage(
              localMsg.sender_id,
              localMsg.encrypted_content,
              signalType
            );
            await MessageRepository.saveDecrypted(localMsg.server_message_id ?? null, localMsg.id ?? null, lastMessageText);
          } catch (e) {
            console.error(`[DECRYPT_FAILED] Could not decrypt message ${localMsg.id}:`, e);
            lastMessageText = '🔒 [Mensagem encriptada]';
          }
        }
        messageId = localMsg.id;
        createdAt = localMsg.created_at;
        if (localMsg.sent_at) {
          const d = new Date(localMsg.sent_at.includes(' ') && !localMsg.sent_at.includes('T') ? localMsg.sent_at.replace(' ', 'T') : localMsg.sent_at);
          if (!isNaN(d.getTime())) {
            lastMessageTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
          }
        }
        lastMessageSenderId = Number(localMsg.sender_id);
      } else {
        // ── Not found in local DB — decrypt server's last_message on the fly ──
        const isMe = Number(conv.last_message_sender_id) === Number(currentUser.id);
        const rawContent = conv.last_message;
        const { signalType: embeddedType } = parseSignalContent(rawContent);
        const signalType = embeddedType ?? conv.last_message_signal_type ?? 3;

        if (isMe) {
          // Outgoing: find the latest message we sent in this conversation
          const latestMe = await db.getFirstAsync<any>(
            `SELECT decrypted_content FROM local_messages
             WHERE conversation_id = ? AND sender_id = ?
             ORDER BY sent_at DESC, id DESC
             LIMIT 1`,
            [String(conv.id), String(currentUser.id)]
          );
          lastMessageText = latestMe?.decrypted_content || '🔒 [Mensagem enviada]';
        } else {
          // Incoming: decrypt immediately — never show ciphertext
          try {
            lastMessageText = await signalService.decryptMessage(
              conv.last_message_sender_id,
              rawContent,
              signalType
            );
            // Save to database immediately
            await MessageRepository.insertRaw({
              server_message_id: null,
              conversation_id: String(conv.id),
              sender_id: String(conv.last_message_sender_id),
              encrypted_content: rawContent,
              decrypted_content: lastMessageText,
              is_decrypted: 1,
              signal_message_type: signalType,
              message_type: 'text',
              sent_at: conv.time || new Date().toISOString(),
            });
          } catch (e) {
            console.error(`[CONV_PREVIEW] Failed to decrypt message for conversation ${conv.id}:`, e);
            lastMessageText = '🔒 [Mensagem encriptada]';
          }
        }
      }
    }

    return {
      ...conv,
      last_message: lastMessageText,
      time: lastMessageTime,
      last_message_sender_id: lastMessageSenderId,
      last_message_status: lastMessageStatus,
    };
  };

  const fetchConversations = async (showLoading = false) => {
    if (!currentUser) return;
    try {
      if (showLoading) setLoading(true);
      const response = await axiosInstance.get('/api/v1/conversations');
      if (response.data.success) {
        const rawConvs = response.data.conversations;
        const processed = await Promise.all(rawConvs.map(processConversation));
        setConversations(processed);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadDeviceContacts(); }, []);

  useFocusEffect(
    useCallback(() => {
      if (currentUser) {
        (async () => {
          // Ensure SignalStore is initialized before any decryption
          await signalService.initialize();
          await signalService.recoverUndecryptedMessages();
          await fetchConversations();
        })();
      }
    }, [currentUser])
  );

  // ── Join rooms for all conversations to receive typing events ──────────
  // Also used to track typing timeouts
  const typingTimeoutsRef = useRef<Record<string, any>>({});
  
  useEffect(() => {
    if (isConnected && conversations.length > 0) {
      conversations.forEach(c => {
        joinConversation(c.id);
        // Re-initialize typing states from server
        if (c.isTyping) {
          // Auto-clear after 5 seconds if no keep-alive
          if (typingTimeoutsRef.current[String(c.id)]) {
            clearTimeout(typingTimeoutsRef.current[String(c.id)]);
          }
          typingTimeoutsRef.current[String(c.id)] = setTimeout(() => {
            setConversations(prev => prev.map(conv => 
              String(conv.id) === String(c.id) ? { ...conv, isTyping: false } : conv
            ));
            delete typingTimeoutsRef.current[String(c.id)];
          }, 5000);
        }
      });
    }
    return () => {
      Object.values(typingTimeoutsRef.current).forEach(t => clearTimeout(t));
      typingTimeoutsRef.current = {};
    };
  }, [isConnected, conversations.length]);

  // Guard against processing the same message twice concurrently.
  // Signal ratchet is one-shot: decrypting the same ciphertext twice destroys the key.
  const processingMsgIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!socket || !currentUser) return;

    const onReceiveMessage = async (msg: any) => {
      const serverMsgId = msg.id ? String(msg.id) : null;

      // ── Deduplication guard ─────────────────────────────────────────────
      // If another invocation of this handler is already processing this
      // message id, bail out immediately to prevent a double-decrypt that
      // corrupts the Signal ratchet (MessageCounterError).
      const dedupKey = serverMsgId ?? `${msg.conversation_id}-${msg.sender_id}-${Date.now()}`;
      if (processingMsgIds.current.has(dedupKey)) {
        console.log(`[ConvList] Skipping duplicate receive_message for id=${dedupKey}`);
        return;
      }
      processingMsgIds.current.add(dedupKey);

      try {
        console.log('[ConvList] receive_message:', { id: msg.id, conversation_id: msg.conversation_id, sender_id: msg.sender_id });
        const isMe = Number(msg.sender_id) === Number(currentUser.id);
        const rawContent = msg.encrypted_content || msg.content || msg.text || '';
        const { signalType: embeddedType } = parseSignalContent(rawContent);
        const signalType = embeddedType ?? (msg.signal_message_type !== undefined ? Number(msg.signal_message_type) : 3);

        let decryptedText: string;

        if (isMe) {
          const db = getDB();
          const latestMe = await db.getFirstAsync<any>(
            `SELECT decrypted_content FROM local_messages
             WHERE conversation_id = ? AND sender_id = ?
             ORDER BY sent_at DESC, id DESC
             LIMIT 1`,
            [String(msg.conversation_id), String(currentUser.id)]
          );
          decryptedText = latestMe?.decrypted_content || '🔒 [Mensagem enviada]';
        } else {
          // ── Step 1: always check DB first (ChatScreen may have decrypted already) ──
          const existing = serverMsgId ? await MessageRepository.getByServerId(serverMsgId) : null;

          if (existing?.decrypted_content) {
            // Already decrypted by ChatScreen or a previous handler — use cache.
            decryptedText = existing.decrypted_content;
            console.log(`[ConvList] Using cached decrypted content for msg ${serverMsgId}`);
          } else {
            // ── Step 2: wait briefly so ChatScreen's handler can win the race ─
            // If it wrote to DB in that time, we skip decryption entirely.
            await new Promise(resolve => setTimeout(resolve, 150));
            const afterWait = serverMsgId ? await MessageRepository.getByServerId(serverMsgId) : null;

            if (afterWait?.decrypted_content) {
              decryptedText = afterWait.decrypted_content;
              console.log(`[ConvList] DB populated during wait for msg ${serverMsgId}`);
            } else {
              // ── Step 3: Decrypt only if nobody else did yet ───────────────
              try {
                decryptedText = await signalService.decryptMessage(
                  msg.sender_id,
                  rawContent,
                  signalType
                );
                console.log(`[ConvList] Decrypted new message ${serverMsgId}`);

                if (!afterWait) {
                  await MessageRepository.insertRaw({
                    server_message_id: serverMsgId,
                    conversation_id: String(msg.conversation_id),
                    sender_id: String(msg.sender_id),
                    encrypted_content: rawContent,
                    decrypted_content: decryptedText,
                    is_decrypted: 1,
                    signal_message_type: signalType,
                    message_type: msg.message_type ?? 'text',
                    sent_at: msg.sent_at,
                  });
                } else {
                  await MessageRepository.saveDecrypted(serverMsgId, afterWait.id ?? null, decryptedText);
                }
              } catch (e) {
                console.error(`[ConvList] Decryption failed for message ${serverMsgId}:`, e);
                decryptedText = '🔒 [Mensagem encriptada]';
              }
            }
          }
        }

        // Helper: parse sent_at in various formats
        function parseConvSentAt(sentAt: string | null | undefined): Date | null {
          if (!sentAt) return null;
          const sanitized = sentAt.includes(' ') && !sentAt.includes('T') ? sentAt.replace(' ', 'T') : sentAt;
          const d = new Date(sanitized);
          return isNaN(d.getTime()) ? null : d;
        }

        const convId = String(msg.conversation_id);
        if (typingTimeoutsRef.current[convId]) {
          clearTimeout(typingTimeoutsRef.current[convId]);
          delete typingTimeoutsRef.current[convId];
        }

        const exists = conversationsRef.current.some(c => String(c.id) === convId);
        if (!exists) {
          fetchConversations();
          return;
        }

        setConversations(prev => {
          const conversationIndex = prev.findIndex(c => String(c.id) === convId);
          const updatedConversations = [...prev];

          if (conversationIndex !== -1) {
            const conv = updatedConversations[conversationIndex];
            const updatedConv: Conversation = {
              ...conv,
              last_message: decryptedText,
              time: msg.sent_at ? (() => {
                const d = parseConvSentAt(msg.sent_at);
                return d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
              })() : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
              unread: isMe ? conv.unread : conv.unread + 1,
              last_message_sender_id: Number(msg.sender_id),
              last_message_status: isMe ? 'delivered' : 'sent',
              isTyping: false
            };
            
            updatedConversations.splice(conversationIndex, 1);
            return [updatedConv, ...updatedConversations];
          }
          return prev;
        });
      } finally {
        // Remove from guard after processing is complete
        setTimeout(() => processingMsgIds.current.delete(dedupKey), 5000);
      }
    };

    const onMessagesRead = (data: any) => {
      setConversations(prev => prev.map(c => {
        if (c.id == data.conversation_id) {
          const isMeReading = data.user_id === currentUser.id;
          return { 
            ...c, 
            unread: isMeReading ? 0 : c.unread,
            last_message_status: (!isMeReading && c.last_message_sender_id === currentUser.id) ? 'read' : c.last_message_status
          };
        }
        return c;
      }));
    };

    const onUserTyping = (data: any) => {
      if (data.user_id !== currentUser.id) {
        setConversations(prev => prev.map(c => 
          String(c.id) === String(data.conversation_id) ? { ...c, isTyping: true } : c
        ));
        const convId = String(data.conversation_id);
        if (typingTimeoutsRef.current[convId]) {
          clearTimeout(typingTimeoutsRef.current[convId]);
        }
        typingTimeoutsRef.current[convId] = setTimeout(() => {
          setConversations(prev => prev.map(c => 
            String(c.id) === convId ? { ...c, isTyping: false } : c
          ));
          delete typingTimeoutsRef.current[convId];
        }, 5000);
      }
    };

    const onUserStopTyping = (data: any) => {
      if (data.user_id !== currentUser.id) {
        setConversations(prev => prev.map(c => 
          String(c.id) === String(data.conversation_id) ? { ...c, isTyping: false } : c
        ));
        const convId = String(data.conversation_id);
        if (typingTimeoutsRef.current[convId]) {
          clearTimeout(typingTimeoutsRef.current[convId]);
          delete typingTimeoutsRef.current[convId];
        }
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
    };
  // ⚠️  Do NOT add `isConnected` here — it causes the effect to re-register
  // before cleanup, producing duplicate listeners that both try to decrypt
  // the same Signal ciphertext, corrupting the ratchet (MessageCounterError).
  }, [socket, currentUser]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchConversations();
  };

  const renderStatus = (item: Conversation) => {
    if (item.isTyping) return null;
    if (item.last_message_sender_id !== currentUser?.id) return null;
    
    let iconName: any = "checkmark";
    let iconColor = "rgba(0,0,0,0.4)"; 

    if (item.last_message_status === 'read') {
      iconName = "checkmark-done";
      iconColor = "#34C759"; 
    } else if (item.last_message_status === 'delivered') {
      iconName = "checkmark-done";
      iconColor = "rgba(0,0,0,0.4)"; 
    }

    return <Ionicons name={iconName} size={16} color={iconColor} style={{ marginRight: 4 }} />;
  };

  const renderChatItem = (item: Conversation) => {
    const hasContact = !!contactMap[normalizePhone(item.phone)];
    const localName = hasContact ? contactMap[normalizePhone(item.phone)] : item.phone;
    return (
      <TouchableOpacity 
        key={item.id}
        style={styles.chatItem} 
        activeOpacity={0.7}
        onPress={() => router.push({
          pathname: '/chat/[id]',
          params: {
            id: String(item.id),
            name: localName,
            image: item.image || '',
            partnerId: String(item.other_user_id),
            phone: item.phone,
            profileName: item.name
          }
        })}
      >
        <View style={styles.avatarWrapper}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.chatAvatar} />
          ) : (
            <View style={[styles.chatAvatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={30} color="#8E8E93" />
            </View>
          )}
        </View>
        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatName} numberOfLines={1}>{localName}</Text>
            <Text style={[styles.chatTime, item.unread > 0 && styles.unreadTime]}>{item.time}</Text>
          </View>
          <View style={styles.chatFooter}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              {renderStatus(item)}
              {item.isTyping ? (
                <Text style={styles.typingText}>escrevendo...</Text>
              ) : (
                <Text style={styles.chatMessage} numberOfLines={1}>
                  {item.last_message}
                </Text>
              )}
            </View>
            {item.unread > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unread}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Conversas</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.push('/contacts')}>
            <Ionicons name="create-outline" size={24} color="#000" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />}>
        <View style={styles.storiesWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storiesContent}>
            {STORIES.map((story) => (
              <View key={story.id} style={styles.storyContainer}>
                <View style={[styles.storyRing, story.isAdd && styles.addStoryRing]}>
                  {story.image ? <Image source={{ uri: story.image }} style={styles.storyAvatar} /> : (
                    <View style={styles.addStoryContent}><Ionicons name={story.isAdd ? "add" : "person"} size={story.isAdd ? 30 : 25} color={story.isAdd ? "#000" : "#8E8E93"} /></View>
                  )}
                </View>
                <Text style={styles.storyName} numberOfLines={1}>{story.name}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={styles.chatsWrapper}>
          {loading ? (
            <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#000" /></View>
          ) : (
            conversations.length > 0 ? (
              conversations.map(renderChatItem)
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubbles-outline" size={80} color="#E0E0E0" />
                <Text style={styles.emptyTitle}>Bem-vindo!</Text>
                <Text style={styles.emptySubtitle}>Inicie uma conversa para vê-la aqui.</Text>
                <TouchableOpacity style={styles.startButton} onPress={() => router.push('/contacts')}><Text style={styles.startButtonText}>Começar a conversar</Text></TouchableOpacity>
              </View>
            )
          )}
        </View>
      </ScrollView>
      <TouchableOpacity style={styles.fab} onPress={() => router.push('/contacts')}><Ionicons name="chatbubble-ellipses" size={24} color="#FFF" /></TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, height: 70 },
  headerTitle: { fontSize: 32, fontWeight: '800', color: '#000' },
  headerActions: { flexDirection: 'row' },
  headerButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 22 },
  storiesWrapper: { paddingVertical: 15 },
  storiesContent: { paddingHorizontal: 15 },
  storyContainer: { alignItems: 'center', marginHorizontal: 10, width: 70 },
  storyRing: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: '#000', padding: 3, marginBottom: 8 },
  addStoryRing: { borderColor: '#E0E0E0', borderStyle: 'dashed' },
  storyAvatar: { width: '100%', height: '100%', borderRadius: 30 },
  addStoryContent: { width: '100%', height: '100%', borderRadius: 30, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  storyName: { fontSize: 12, fontWeight: '500', color: '#333', textAlign: 'center' },
  chatsWrapper: { flex: 1, paddingTop: 10 },
  chatItem: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 15, alignItems: 'center' },
  avatarWrapper: { position: 'relative' },
  chatAvatar: { width: 64, height: 64, borderRadius: 32, marginRight: 15 },
  avatarPlaceholder: { backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  chatInfo: { flex: 1, justifyContent: 'center', borderBottomWidth: 0.5, borderBottomColor: '#F0F0F0', paddingBottom: 15 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  chatName: { fontSize: 17, fontWeight: '700', color: '#000' },
  chatTime: { fontSize: 13, color: '#8E8E93' },
  unreadTime: { color: '#000', fontWeight: '600' },
  chatFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chatMessage: { fontSize: 15, color: '#8E8E93', flex: 1, marginRight: 10 },
  typingText: { fontSize: 15, color: '#34C759', fontStyle: 'italic', fontWeight: '600' },
  unreadBadge: { backgroundColor: '#000', minWidth: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  unreadText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  loadingContainer: { padding: 50, alignItems: 'center' },
  emptyContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 22, fontWeight: '800', marginBottom: 12 },
  emptySubtitle: { fontSize: 16, color: '#8E8E93', textAlign: 'center', marginBottom: 30 },
  startButton: { backgroundColor: '#000', paddingHorizontal: 25, paddingVertical: 15, borderRadius: 30 },
  startButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  fab: { position: 'absolute', right: 25, bottom: 25, width: 60, height: 60, borderRadius: 30, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', elevation: 10 },
});

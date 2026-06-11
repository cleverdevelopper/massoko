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
  Alert,
  Modal,
  Dimensions,
  ScrollView,
} from 'react-native';
import * as Contacts from 'expo-contacts/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
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
  withSpring,
  useSharedValue,
  withDelay,
} from 'react-native-reanimated';
import axiosInstance from '@/utils/axiosInstance';
import { useChatSocket } from '@/context/ChatSocketContext';
import { useAuth } from '@/context/AuthContext';
import { signalService } from '@/utils/signal/SignalService';
import { MessageRepository } from '@/utils/repositories/MessageRepository';
import { SignalStatusIcon } from '@/components/SignalStatusIcon';

interface Message {
  id: string | number;
  text?: string;
  sender: 'me' | 'other';
  time: string;
  sentAt?: string; // full ISO date string for date separator badges
  status?: 'sent' | 'delivered' | 'read';
  type?: 'text' | 'image' | 'document' | 'audio' | 'location' | 'contact';
  mediaUrl?: string;
  fileName?: string;
  fileSize?: string;
  contactName?: string;
  contactPhone?: string;
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
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return timeStr || '';
}

/**
 * Format a date label for chat date separator badges.
 * - "Hoje" for today
 * - "Ontem" for yesterday
 * - Full weekday ("Segunda-feira", etc.) for this week
 * - Abbreviated weekday + dd/MM for older ("Sex, 28/05")
 */
function formatDateLabel(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const d = parseSentAt(dateStr);
  if (!d) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffMs = today.getTime() - msgDay.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';

  const weekdaysFull = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const weekdaysShort = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  if (diffDays < 7) {
    return weekdaysFull[d.getDay()];
  }

  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${weekdaysShort[d.getDay()]}, ${dd}/${mm}`;
}

/** Check if two ISO date strings fall on different calendar days */
function isDifferentDay(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const da = parseSentAt(a);
  const db = parseSentAt(b);
  if (!da || !db) return false;
  return da.getFullYear() !== db.getFullYear() || da.getMonth() !== db.getMonth() || da.getDate() !== db.getDate();
}

const normalizePhone = (phone?: string) => {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 9 ? cleaned.slice(-9) : cleaned;
};

function formatMessageObject(m: any, currentUserId: string): Message {
  const isMe = String(m.sender_id) === String(currentUserId);
  const rawText = m.decrypted_content ?? m.encrypted_content ?? '';
  
  let type: 'text' | 'image' | 'document' | 'audio' | 'location' | 'contact' = 'text';
  let text = rawText;
  let mediaUrl: string | undefined;
  let fileName: string | undefined;
  let fileSize: string | undefined;
  let contactName: string | undefined;
  let contactPhone: string | undefined;

  if (rawText.trim().startsWith('{') && rawText.trim().endsWith('}')) {
    try {
      const parsed = JSON.parse(rawText);
      if (parsed.type) {
        type = parsed.type;
        text = parsed.text ?? '';
        mediaUrl = parsed.mediaUrl;
        fileName = parsed.fileName;
        fileSize = parsed.fileSize;
        contactName = parsed.contactName;
        contactPhone = parsed.contactPhone;
      }
    } catch (e) {
      // Ignorar e tratar como texto
    }
  }

  if (type === 'text' && m.message_type && m.message_type !== 'text') {
    type = m.message_type as any;
  }

  return {
    id: m.server_message_id ?? String(m.id!),
    text,
    sender: isMe ? 'me' : 'other',
    time: formatMsgTime(m.sent_at),
    sentAt: m.sent_at ?? undefined,
    status: isMe ? 'delivered' : 'sent',
    type,
    mediaUrl,
    fileName,
    fileSize,
    contactName,
    contactPhone,
  };
}

const ATTACHMENT_OPTIONS = [
  { id: 'gallery', name: 'Photos', icon: 'images-outline' },
  { id: 'gif', name: 'GIF', icon: 'film-outline' },
  { id: 'document', name: 'File', icon: 'document-text-outline' },
  { id: 'contact', name: 'Contact', icon: 'person-outline' },
  { id: 'location', name: 'Location', icon: 'location-outline' },
];

const MOCK_PHOTOS = [
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=150',
  'https://images.unsplash.com/photo-1511576661531-b3837fe1266b?w=150',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=150',
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=150',
  'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=150',
];

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { id, name, image, partnerId } = params;
  const { user: currentUser } = useAuth();
  const insets = useSafeAreaInsets();

  const [messageText, setMessageText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState<Record<number, boolean>>({});

  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(330);
  const [isKeyboardActive, setIsKeyboardActive] = useState(false);
  const attachmentHeight = useSharedValue(0);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        setIsKeyboardActive(true);
        setShowAttachmentMenu(false);
      }
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setIsKeyboardActive(false);
      }
    );
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    attachmentHeight.value = withTiming(showAttachmentMenu ? keyboardHeight : 0, { duration: 250 });
  }, [showAttachmentMenu, keyboardHeight]);

  const toggleAttachmentMenu = () => {
    if (showAttachmentMenu) {
      setShowAttachmentMenu(false);
    } else {
      if (isKeyboardActive) {
        setShowAttachmentMenu(true);
        Keyboard.dismiss();
      } else {
        setShowAttachmentMenu(true);
      }
    }
  };

  const closeAttachmentMenu = () => {
    setShowAttachmentMenu(false);
  };

  const animatedContainerStyle = useAnimatedStyle(() => {
    return {
      height: attachmentHeight.value,
      overflow: 'hidden',
    };
  });

  const uploadAndSendFile = async (
    uri: string,
    originalName: string,
    mimeType: string,
    mediaType: 'image' | 'video' | 'document'
  ) => {
    const tempId = `temp-${Date.now()}`;
    
    // Optimistic UI
    const optimistic: Message = {
      id: tempId,
      sender: 'me',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
      sentAt: new Date().toISOString(),
      status: 'sent',
      type: mediaType,
      mediaUrl: uri,
      fileName: originalName,
      fileSize: 'A enviar...',
    };
    
    setMessages((prev) => [optimistic, ...prev]);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });

    try {
      const formData = new FormData();
      // React Native's new arch fetch doesn't support {uri,name,type} parts —
      // only XMLHttpRequest does.
      formData.append('file', {
        uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
        name: originalName || 'file',
        type: mimeType || 'application/octet-stream',
      } as any);

      const { getAccessToken } = await import('@/utils/tokenStorage');
      const token = getAccessToken();
      const uploadUrl = `${process.env.EXPO_PUBLIC_SERVER_URI}/api/v1/messages/upload`;

      console.log('[UPLOAD] Sending to:', uploadUrl);

      // ── XMLHttpRequest — the only RN API that handles {uri,name,type} FormData parts ──
      const responseData: any = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        // Do NOT set Content-Type — XHR sets multipart boundary automatically
        xhr.onload = () => {
          console.log('[UPLOAD] Status:', xhr.status, 'Body:', xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error(`Resposta inválida do servidor: ${xhr.responseText}`));
            }
          } else {
            reject(new Error(`Upload falhou (${xhr.status}): ${xhr.responseText}`));
          }
        };
        xhr.onerror = () => reject(new Error('Falha de rede ao enviar ficheiro'));
        xhr.ontimeout = () => reject(new Error('Timeout ao enviar ficheiro'));
        xhr.timeout = 60000; // 60 seconds
        xhr.send(formData);
      });

      if (!responseData?.success) {
        throw new Error(responseData?.message || 'Erro no upload');
      }

      const fileUrl = responseData.url;
      const fileSize = responseData.size;
      
      let formattedSize = '0 B';
      if (fileSize) {
        const bytes = Number(fileSize);
        if (bytes < 1024) formattedSize = `${bytes} B`;
        else if (bytes < 1048576) formattedSize = `${(bytes / 1024).toFixed(1)} KB`;
        else formattedSize = `${(bytes / 1048576).toFixed(1)} MB`;
      }

      // Payload JSON to be E2E encrypted
      const payload = {
        type: mediaType,
        mediaUrl: fileUrl,
        fileName: originalName,
        fileSize: formattedSize,
        text: '',
      };
      
      const content = JSON.stringify(payload);
      const targetPartnerId = (partnerId as string) || conversationId;
      const encrypted = await signalService.encryptMessage(targetPartnerId, content);

      if (isConnected) {
        sendMessage(conversationId, encrypted.body, encrypted.type, mediaType);
      } else {
        await MessageRepository.enqueue(tempId, conversationId, encrypted.body, encrypted.type);
      }

      await MessageRepository.insertRaw({
        server_message_id: tempId,
        conversation_id: conversationId,
        sender_id: String(currentUser?.id),
        encrypted_content: encrypted.body,
        decrypted_content: content,
        signal_message_type: encrypted.type,
        message_type: mediaType,
        sent_at: new Date().toISOString(),
      });

      // Update message with server info
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, mediaUrl: fileUrl, fileSize: formattedSize }
            : m
        )
      );
    } catch (e: any) {
      console.error('[UPLOAD_SEND_FILE] Error:', e);
      Alert.alert('Erro', e.message || 'Falha ao enviar arquivo');
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }
  };

  const handleCameraPress = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permissão necessária', 'Acesso à câmera é necessário para tirar fotos.');
      return;
    }

    const pickerResult = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
      const asset = pickerResult.assets[0];
      const uri = asset.uri;
      const name = asset.fileName || `photo_${Date.now()}.${uri.split('.').pop()}`;
      const mimeType = asset.mimeType || 'image/jpeg';
      
      await uploadAndSendFile(uri, name, mimeType, 'image');
    }
  };

  const handleSelectOption = async (option: typeof ATTACHMENT_OPTIONS[0]) => {
    closeAttachmentMenu();

    if (option.id === 'gallery') {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permissão necessária', 'Acesso à galeria é necessário para enviar fotos/vídeos.');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
        const asset = pickerResult.assets[0];
        const uri = asset.uri;
        const name = asset.fileName || `media_${Date.now()}.${uri.split('.').pop()}`;
        const mimeType = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
        const mediaType = asset.type === 'video' ? 'video' : 'image';
        
        await uploadAndSendFile(uri, name, mimeType, mediaType as any);
      }
    } else if (option.id === 'document') {
      try {
        const docResult = await DocumentPicker.getDocumentAsync({
          type: '*/*',
          copyToCacheDirectory: true,
        });

        if (!docResult.canceled && docResult.assets && docResult.assets.length > 0) {
          const asset = docResult.assets[0];
          const uri = asset.uri;
          const name = asset.name;
          const mimeType = asset.mimeType || 'application/octet-stream';
          
          await uploadAndSendFile(uri, name, mimeType, 'document');
        }
      } catch (e) {
        console.error('[DocumentPicker] Error:', e);
      }
    } else {
      const tempId = `temp-mock-${Date.now()}`;
      let mockMessage: Message = {
        id: tempId,
        sender: 'me',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        sentAt: new Date().toISOString(),
        status: 'sent',
      };
      
      if (option.id === 'gif') {
        mockMessage = {
          ...mockMessage,
          type: 'image',
          text: 'GIF enviado',
          mediaUrl: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3NpaXZ0YndxOHZ2ZWd4eGJjYTV3dWgwbWRvdzRwNXJod3I5bXo1NyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7TKSjRrfIPjei1fG/giphy.gif',
        };
      } else if (option.id === 'location') {
        mockMessage = {
          ...mockMessage,
          type: 'location',
          text: 'Avenida da Independência, 1024, Luanda, Angola',
        };
      } else if (option.id === 'contact') {
        mockMessage = {
          ...mockMessage,
          type: 'contact',
          contactName: 'Massoko Suporte',
          contactPhone: '+244 923 000 000',
        };
      }
      setMessages((prev) => [mockMessage, ...prev]);
    }
  };

  const [partnerPhone, setPartnerPhone] = useState<string>((params.phone as string) || '');
  const [partnerProfileName, setPartnerProfileName] = useState<string>((params.profileName as string) || '');
  const [isContactSaved, setIsContactSaved] = useState<boolean>(true);
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);

  const displayName = (name as string) || 'Conversa';
  const displayImage = (image as string) || null;
  const conversationId = id as string;

  const handleHeaderPress = () => {
    router.push({
      pathname: '/chat/profile',
      params: {
        id: conversationId,
        partnerId: (partnerId as string) || conversationId,
        name: displayName,
        phone: partnerPhone,
        profileName: partnerProfileName,
        image: displayImage || '',
        isContactSaved: String(isContactSaved),
      }
    });
  };

  // Check if contact is saved on device
  useEffect(() => {
    const checkContactStatus = async () => {
      if (!partnerPhone) return;
      try {
        const { status } = await Contacts.requestPermissionsAsync();
        if (status === 'granted') {
          const { data } = await Contacts.getContactsAsync({
            fields: [Contacts.Fields.PhoneNumbers],
          });
          const normalizedPartner = normalizePhone(partnerPhone);
          const saved = data.some(contact =>
            contact.phoneNumbers?.some(p => p.number && normalizePhone(p.number) === normalizedPartner)
          );
          setIsContactSaved(saved);
        }
      } catch (error) {
        console.error('Error checking contact status:', error);
      }
    };
    checkContactStatus();
  }, [partnerPhone]);

  // Fetch conversation details from server if phone or profile name is missing
  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const response = await axiosInstance.get('/api/v1/conversations');
        if (response.data.success) {
          const found = response.data.conversations.find((c: any) => String(c.id) === String(conversationId));
          if (found) {
            if (!partnerPhone) setPartnerPhone(found.phone);
            setPartnerProfileName(found.name);
          }
        }
      } catch (error) {
        console.error('Error fetching conversation details for header:', error);
      }
    };
    fetchInfo();
  }, [conversationId]);

  const handleAddContact = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Precisa permitir o acesso aos contactos.');
        return;
      }
      
      await Contacts.presentFormAsync(undefined, {
        firstName: partnerProfileName || '',
        phoneNumbers: [{ label: 'mobile', number: partnerPhone }],
      } as any);
      
      // Refresh status after dialog is closed
      setTimeout(async () => {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers],
        });
        const normalizedPartner = normalizePhone(partnerPhone);
        const saved = data.some(contact =>
          contact.phoneNumbers?.some(p => p.number && normalizePhone(p.number) === normalizedPartner)
        );
        setIsContactSaved(saved);
      }, 2000);
    } catch (error) {
      console.error('Error adding contact:', error);
      Alert.alert('Erro', 'Não foi possível abrir o formulário de contactos.');
    }
  };

  const handleBlockContact = () => {
    Alert.alert(
      'Bloquear Contacto',
      `Tem a certeza de que deseja bloquear o número ${partnerPhone}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bloquear',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Bloqueado', 'Contacto bloqueado com sucesso.');
          }
        }
      ]
    );
  };

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



  // ── Load messages ────────────────────────────────────────────────────────

  const loadMessages = useCallback(async () => {
    if (!currentUser) return;
    try {
      // ── Step 0: Recover undecrypted messages for this conversation first ──
      await signalService.recoverUndecryptedMessages(conversationId);

      // ── Step 1: Load cached messages from SQLite first ──────────────────
      const cached = await MessageRepository.getMessages(conversationId);
      if (cached.length > 0) {
        const formatted = cached.map((m) => formatMessageObject(m, String(currentUser.id)));
        // SQLite stores oldest-first. Reverse it to display newest-first in inverted FlatList.
        setMessages((prev) => {
          const cachedMsgs = formatted.reverse();
          const merged = [...prev];
          for (const m of cachedMsgs) {
            if (!merged.some((em) => em.id === m.id)) {
              merged.push(m);
            }
          }
          return merged;
        });
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
        let existing = await MessageRepository.getByServerId(serverMsgId);
        if (!existing && isMe) {
          // Check if there is a temp message that matches this outgoing message
          existing = await MessageRepository.findTempMessage(String(currentUser.id), rawContent);
          if (existing) {
            await MessageRepository.updateServerMessageId(existing.server_message_id!, serverMsgId, rawContent, msg.sent_at);
            existing = await MessageRepository.getByServerId(serverMsgId);
          }
        }

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

          decryptedMsgs.push(formatMessageObject({
            server_message_id: serverMsgId,
            conversation_id: conversationId,
            sender_id: String(currentUser.id),
            encrypted_content: rawContent,
            decrypted_content: displayText,
            message_type: msg.type ?? msg.message_type ?? 'text',
            sent_at: msg.sent_at
          }, String(currentUser.id)));
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

          decryptedMsgs.push(formatMessageObject({
            server_message_id: serverMsgId,
            conversation_id: conversationId,
            sender_id: String(msg.sender_id),
            encrypted_content: rawContent,
            decrypted_content: displayText,
            message_type: msg.type ?? msg.message_type ?? 'text',
            sent_at: msg.sent_at
          }, String(currentUser.id)));
        }
      }

      // Reverse back to newest-first for the inverted FlatList view
      setMessages((prev) => {
        const serverMsgs = decryptedMsgs.reverse();
        const merged = [...serverMsgs];
        for (const m of prev) {
          if (!merged.some((sm) => sm.id === m.id)) {
            // Skip temp message if the same text has already been saved on the server
            if (String(m.id).startsWith('temp-')) {
              const textExists = merged.some((sm) => sm.text === m.text && sm.sender === 'me');
              if (textExists) continue;
            }
            merged.push(m);
          }
        }
        // Keep temp messages at the top of the list (which is the beginning of the inverted array)
        const temps = merged.filter((m) => String(m.id).startsWith('temp-'));
        const nonTemps = merged.filter((m) => !String(m.id).startsWith('temp-'));
        return [...temps, ...nonTemps];
      });
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
            // Update the temporary ID in SQLite to the official serverMsgId instead of inserting a duplicate row!
            MessageRepository.updateServerMessageId(String(optimistic.id), serverMsgId, rawContent, msg.sent_at)
              .catch(console.error);

            return prev.map((m) =>
              m.id === optimistic.id
                ? { ...m, id: serverMsgId, status: 'delivered', time: formatMsgTime(msg.sent_at, msg.time) }
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

      const formatted = formatMessageObject({
        server_message_id: serverMsgId ?? `${Date.now()}-${Math.random()}`,
        conversation_id: conversationId,
        sender_id: String(msg.sender_id),
        encrypted_content: rawContent,
        decrypted_content: displayText,
        message_type: msg.type ?? msg.message_type ?? 'text',
        sent_at: msg.sent_at
      }, String(currentUser.id));

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
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
      sentAt: new Date().toISOString(),
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
        server_message_id: tempId, // will be updated when server responds via socket
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

    const nextItem = messages[index + 1];
    const showDateSeparator = !nextItem || isDifferentDay(item.sentAt, nextItem?.sentAt);

    const renderStatus = () => {
      if (!isMe) return null;
      return <SignalStatusIcon status={item.status || 'sent'} size={15} style={styles.checkIcon} />;
    };

    const renderBubbleContent = () => {
      const type = item.type || 'text';

      if (type === 'image' || type === 'video') {
        return (
          <View style={styles.imageBubbleContent}>
            <Image
              source={{ uri: item.mediaUrl }}
              style={styles.imageMedia}
              contentFit="cover"
            />
            {type === 'video' && (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                <Ionicons name="play-circle" size={48} color="#FFF" />
              </View>
            )}
            {item.text ? <Text style={styles.imageTextLabel}>{item.text}</Text> : null}
            <View style={[styles.imageStatusOverlay, type === 'video' && { zIndex: 2 }]}>
              <Text style={styles.imageTimeText}>{item.time}</Text>
              {renderStatus()}
            </View>
          </View>
        );
      }

      if (type === 'document') {
        return (
          <View style={styles.documentBubbleContent}>
            <View style={styles.documentHeader}>
              <View style={styles.documentIconWrapper}>
                <Ionicons name="document-text" size={24} color="#FFF" />
              </View>
              <View style={styles.documentInfo}>
                <Text style={styles.documentName} numberOfLines={1}>
                  {item.fileName}
                </Text>
                <Text style={styles.documentSize}>{item.fileSize}</Text>
              </View>
              <TouchableOpacity style={styles.documentDownloadBtn}>
                <Ionicons name="arrow-down-circle" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>
            <View style={styles.bubbleStatusContainer}>
              <Text style={[styles.timeText, isMe ? styles.myTimeText : styles.otherTimeText]}>
                {item.time}
              </Text>
              {renderStatus()}
            </View>
          </View>
        );
      }

      if (type === 'audio') {
        return (
          <View style={styles.audioBubbleContent}>
            <View style={styles.audioPlayerRow}>
              <TouchableOpacity style={styles.audioPlayBtn}>
                <Ionicons name="play" size={20} color={isMe ? '#000' : '#8E8E93'} />
              </TouchableOpacity>
              <View style={styles.audioWaveform}>
                <View style={[styles.waveformBar, { height: 12 }]} />
                <View style={[styles.waveformBar, { height: 18 }]} />
                <View style={[styles.waveformBar, { height: 24 }]} />
                <View style={[styles.waveformBar, { height: 15 }]} />
                <View style={[styles.waveformBar, { height: 20 }]} />
                <View style={[styles.waveformBar, { height: 10 }]} />
                <View style={[styles.waveformBar, { height: 18 }]} />
                <View style={[styles.waveformBar, { height: 14 }]} />
              </View>
              <Text style={styles.audioDuration}>{item.fileSize}</Text>
            </View>
            <View style={styles.bubbleStatusContainer}>
              <Text style={[styles.timeText, isMe ? styles.myTimeText : styles.otherTimeText]}>
                {item.time}
              </Text>
              {renderStatus()}
            </View>
          </View>
        );
      }

      if (type === 'location') {
        return (
          <View style={styles.locationBubbleContent}>
            <View style={styles.locationMockMap}>
              <Ionicons name="location" size={32} color="#FF3B30" />
              <Text style={styles.locationPinText}>Localização Partilhada</Text>
            </View>
            <View style={styles.locationDetails}>
              <Text style={styles.locationAddress} numberOfLines={2}>
                {item.text}
              </Text>
            </View>
            <View style={styles.bubbleStatusContainer}>
              <Text style={[styles.timeText, isMe ? styles.myTimeText : styles.otherTimeText]}>
                {item.time}
              </Text>
              {renderStatus()}
            </View>
          </View>
        );
      }

      if (type === 'contact') {
        return (
          <View style={styles.contactBubbleContent}>
            <View style={styles.contactHeader}>
              <View style={styles.contactAvatar}>
                <Ionicons name="person" size={20} color="#FFF" />
              </View>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>{item.contactName}</Text>
                <Text style={styles.contactPhone}>{item.contactPhone}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.contactActionBtn}>
              <Text style={styles.contactActionText}>Adicionar Contacto</Text>
            </TouchableOpacity>
            <View style={styles.bubbleStatusContainer}>
              <Text style={[styles.timeText, isMe ? styles.myTimeText : styles.otherTimeText]}>
                {item.time}
              </Text>
              {renderStatus()}
            </View>
          </View>
        );
      }

      return (
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
      );
    };

    const isMediaOrCustom = item.type && item.type !== 'text';

    return (
      <>
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
              isMediaOrCustom && styles.mediaBubble,
              {
                borderBottomRightRadius: isMe && isLastInGroup ? 4 : 18,
                borderBottomLeftRadius: !isMe && isLastInGroup ? 4 : 18,
              },
            ]}
          >
            {renderBubbleContent()}
          </View>
        </View>
        {showDateSeparator && item.sentAt ? (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateText}>{formatDateLabel(item.sentAt)}</Text>
          </View>
        ) : null}
      </>
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
            <TouchableOpacity 
              activeOpacity={0.8} 
              onPress={() => setIsImageViewerVisible(true)}
              style={styles.avatarContainer}
            >
              {displayImage ? (
                <Image source={{ uri: displayImage }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' }]}>
                  <Ionicons name="person" size={20} color="#8E8E93" />
                </View>
              )}
              <View style={[styles.statusDot, { backgroundColor: isConnected ? '#34C759' : '#FF9500' }]} />
            </TouchableOpacity>

            <TouchableOpacity 
              activeOpacity={0.7} 
              onPress={handleHeaderPress}
              style={styles.userInfoTextContainer}
            >
              <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
              <Text style={styles.onlineStatus}>{isConnected ? 'Online' : 'Conectando...'}</Text>
            </TouchableOpacity>
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
            <View style={{ width: '100%' }}>
              <View style={styles.dateSeparator}>
                <Text style={styles.dateText}>Início da conversa</Text>
              </View>

              {/* E2E Encryption Notice */}
              <View style={styles.encryptionCard}>
                <Ionicons name="lock-closed" size={12} color="#806000" style={{ marginRight: 6, marginTop: 2 }} />
                <Text style={styles.encryptionText}>
                  As mensagens e chamadas são protegidas por criptografia de ponta a ponta. Somente os utilizadores desta conversa conseguem ler, ouvir e compartilhar os conteúdos da mesma.{' '}
                  <Text style={styles.learnMoreText}>Saiba mais</Text>
                </Text>
              </View>

              {/* Unsaved contact options block */}
              {!isContactSaved && partnerPhone ? (
                <View style={styles.unsavedContainer}>
                  <View style={styles.unsavedCard}>
                    {displayImage ? (
                      <Image source={{ uri: displayImage }} style={styles.unsavedAvatar} />
                    ) : (
                      <View style={styles.unsavedAvatarContainer}>
                        <Ionicons name="person" size={24} color="#FFF" />
                      </View>
                    )}
                    
                    <Text style={styles.unsavedPhone}>{partnerPhone}</Text>
                    <Text style={styles.unsavedProfileName}>~{partnerProfileName || displayName}</Text>
                    <Text style={styles.unsavedSubtitle}>Não está nos contactos • Sem grupos em comum</Text>
                    
                    

                    <View style={styles.unsavedActionsRow}>
                      <TouchableOpacity 
                        style={[styles.unsavedButton, styles.blockButton]} 
                        activeOpacity={0.7}
                        onPress={handleBlockContact}
                      >
                        <Ionicons name="ban" size={18} color="#FF3B30" style={{ marginRight: 6 }} />
                        <Text style={styles.blockButtonText}>Bloquear</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity 
                        style={[styles.unsavedButton, styles.addButtonCard]} 
                        activeOpacity={0.7}
                        onPress={handleAddContact}
                      >
                        <Ionicons name="person-add" size={18} color="#FFF" style={{ marginRight: 6 }} />
                        <Text style={styles.addButtonText}>Adicionar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          )}
        />
      )}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.addButton, showAttachmentMenu && styles.closeButtonActive]}
            onPress={toggleAttachmentMenu}
            activeOpacity={0.7}
          >
            <Ionicons 
              name={showAttachmentMenu ? "close" : "add"} 
              size={24} 
              color={showAttachmentMenu ? "#FFF" : "#000"} 
            />
          </TouchableOpacity>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Mensagem"
              value={messageText}
              onChangeText={handleTextChange}
              placeholderTextColor="#8E8E93"
              onFocus={() => {
                setShowAttachmentMenu(false);
              }}
            />
            <TouchableOpacity style={styles.inputIcon}>
              <Ionicons name="happy-outline" size={22} color="#8E8E93" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.inputIcon} onPress={handleCameraPress}>
              <Ionicons name="camera-outline" size={22} color="#8E8E93" />
            </TouchableOpacity>
          </View>
          
          {messageText.trim() ? (
            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSend}
              activeOpacity={0.7}
            >
              <Ionicons name="send" size={18} color="#FFF" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.micButton} activeOpacity={0.7}>
              <Ionicons name="mic-outline" size={22} color="#000" />
            </TouchableOpacity>
          )}
        </View>

        {/* Dynamic height attachment menu that mirrors keyboard height */}
        <Animated.View style={animatedContainerStyle}>
          <View style={styles.attachmentSheet}>
            <View style={styles.photoPreviewSection}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoList}>
                {[...MOCK_PHOTOS].reverse().map((uri, idx) => (
                  <Image key={idx} source={{ uri }} style={styles.photoThumb} />
                ))}
              </ScrollView>
            </View>

            {/* Horizontal Actions List */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalOptions}>
              {ATTACHMENT_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={styles.circleOption}
                  onPress={() => handleSelectOption(option)}
                  activeOpacity={0.8}
                >
                  <View style={styles.circleIconContainer}>
                    <Ionicons name={option.icon as any} size={22} color="#3A3A3C" />
                  </View>
                  <Text style={styles.circleOptionText}>{option.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
      <View style={{ height: insets.bottom, backgroundColor: showAttachmentMenu ? '#FFF' : '#FFF' }} />

      {/* WhatsApp/Telegram Style Full Screen Profile Image Viewer Modal */}
      <Modal
        visible={isImageViewerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsImageViewerVisible(false)}
      >
        <View style={styles.imageViewerContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
          
          {/* Viewer Header */}
          <View style={[styles.imageViewerHeader, { paddingTop: insets.top }]}>
            <TouchableOpacity 
              onPress={() => setIsImageViewerVisible(false)} 
              style={styles.closeButton}
            >
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.imageViewerTitle}>{displayName}</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Full Screen Image */}
          <View style={styles.fullscreenImageContainer}>
            {displayImage ? (
              <Image 
                source={{ uri: displayImage }} 
                style={styles.fullscreenImage} 
                contentFit="contain" 
              />
            ) : (
              <View style={styles.fullscreenPlaceholder}>
                <Ionicons name="person" size={120} color="#FFF" />
                <Text style={{ color: '#FFF', marginTop: 15, fontSize: 16 }}>Sem foto de perfil</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

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
  myBubble: { backgroundColor: '#1B72E8', borderBottomRightRadius: 4 },
  otherBubble: { backgroundColor: '#FFF', borderBottomLeftRadius: 4, borderWidth: 0.5, borderColor: '#E0E0E0' },
  messageText: { fontSize: 15, lineHeight: 20 },
  myMessageText: { color: '#FFF' },
  otherMessageText: { color: '#000' },
  bubbleContent: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'flex-end' },
  bubbleStatusContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, marginLeft: 12, marginBottom: -2 },
  timeText: { fontSize: 10, color: 'rgba(0,0,0,0.5)' },
  myTimeText: { color: 'rgba(255,255,255,0.7)' },
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
  encryptionCard: {
    backgroundColor: '#FFF9E6',
    borderRadius: 10,
    padding: 10,
    marginHorizontal: 16,
    marginVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 0.5,
    borderColor: '#FFEBB3',
    alignSelf: 'center',
    maxWidth: '92%',
  },
  encryptionText: {
    fontSize: 12,
    color: '#806000',
    lineHeight: 16,
    flex: 1,
  },
  learnMoreText: {
    fontWeight: '600',
    color: '#007AFF',
  },
  unsavedContainer: {
    paddingHorizontal: 16,
    paddingVertical: 15,
    alignItems: 'center',
    width: '100%',
  },
  unsavedCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    width: '100%',
    borderWidth: 0.5,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  unsavedAvatarContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FF2D55',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  unsavedAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginBottom: 12,
  },
  unsavedPhone: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  unsavedProfileName: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  unsavedSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 12,
  },
  safetyToolsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  safetyToolsText: {
    fontSize: 14,
    color: '#34C759',
    fontWeight: '600',
  },
  unsavedActionsRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    gap: 12,
  },
  unsavedButton: {
    flex: 1,
    flexDirection: 'row',
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blockButton: {
    backgroundColor: '#F2F2F7',
  },
  blockButtonText: {
    color: '#FF3B30',
    fontSize: 15,
    fontWeight: '600',
  },
  addButtonCard:{
    backgroundColor: '#000',
  }
  ,
  addButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  userInfoTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  imageViewerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  imageViewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 56,
    backgroundColor: 'rgba(0,0,0,0.6)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  closeButton: {
    padding: 4,
  },
  imageViewerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 16,
    flex: 1,
  },
  fullscreenImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.8,
  },
  fullscreenPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonActive: {
    backgroundColor: '#3A3A3C',
  },
  micButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachmentContainer: {
    backgroundColor: '#FFF',
  },
  attachmentSheet: {
    backgroundColor: '#FFF',
    flex: 1,
    paddingTop: 12,
    paddingBottom: 0,
    borderTopWidth: 0.5,
    borderTopColor: '#E0E0E0',
  },
  photoPreviewSection: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  photoList: {
    gap: 8,
    paddingRight: 16,
  },
  photoThumb: {
    width: 75,
    height: 100,
    borderRadius: 12,
  },
  horizontalOptions: {
    paddingHorizontal: 16,
    gap: 20,
    alignItems: 'center',
    height: 88,
  },
  circleOption: {
    alignItems: 'center',
  },
  circleIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: '#D1D1D6',
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  circleOptionText: {
    color: '#3A3A3C',
    fontSize: 11,
    fontWeight: '500',
  },
  mediaBubble: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: 'hidden',
  },
  imageBubbleContent: {
    width: 240,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#F2F2F7',
  },
  imageMedia: {
    width: '100%',
    height: 160,
  },
  imageTextLabel: {
    fontSize: 14,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    color: '#000',
  },
  imageStatusOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'absolute',
    bottom: 6,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  imageTimeText: {
    fontSize: 10,
    color: '#FFF',
  },
  documentBubbleContent: {
    width: 240,
    padding: 12,
    backgroundColor: '#F2F2F7',
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  documentIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  documentInfo: {
    flex: 1,
    marginLeft: 10,
  },
  documentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  documentSize: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  documentDownloadBtn: {
    padding: 4,
  },
  audioBubbleContent: {
    width: 240,
    padding: 12,
    backgroundColor: '#F2F2F7',
  },
  audioPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  audioPlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  audioWaveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 12,
    gap: 3,
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
    backgroundColor: '#007AFF',
  },
  audioDuration: {
    fontSize: 12,
    color: '#8E8E93',
  },
  locationBubbleContent: {
    width: 240,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#F2F2F7',
  },
  locationMockMap: {
    height: 120,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationPinText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
    marginTop: 6,
  },
  locationDetails: {
    padding: 12,
  },
  locationAddress: {
    fontSize: 13,
    color: '#000',
    lineHeight: 18,
  },
  contactBubbleContent: {
    width: 240,
    backgroundColor: '#F2F2F7',
    padding: 12,
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  contactAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#5AC8FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactInfo: {
    marginLeft: 10,
    flex: 1,
  },
  contactName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  contactPhone: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  contactActionBtn: {
    borderTopWidth: 0.5,
    borderTopColor: '#C7C7CC',
    paddingTop: 10,
    alignItems: 'center',
  },
  contactActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
});






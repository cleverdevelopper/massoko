import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Modal,
  Keyboard,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

const MESSAGES = [
  {
    id: '1',
    text: 'Oi Niki! 👋',
    sender: 'me',
    time: '21:32',
    status: 'read',
  },
  {
    id: '2',
    text: 'Você vem para a academia mais tarde hoje?',
    sender: 'me',
    time: '21:32',
    status: 'read',
  },
  {
    id: '3',
    text: 'Oi Brian! 🏋️‍♀️ Sim, estarei lá por volta das 17h. Quer me acompanhar?',
    sender: 'other',
    time: '21:32',
  },
  {
    id: '4',
    text: 'Eu estava pensando em fazer um misto de cardio e musculação 💪. E você?',
    sender: 'me',
    time: '21:32',
    status: 'read',
  },
  {
    id: '5',
    text: 'Preciso focar nas pernas hoje. Talvez possamos fazer exercícios de força? 🤔',
    sender: 'other',
    time: '21:33',
  },
  {
    id: '6',
    text: 'Perfeito! Podemos começar com cardio e depois ir para as pernas 🔥',
    sender: 'me',
    time: '21:34',
    status: 'read',
  },
];

export default function ChatScreen() {
  const router = useRouter();
  const { id, name, image } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [attachmentModalVisible, setAttachmentModalVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const AttachmentOption = ({ icon, label, color }: { icon: any, label: string, color: string }) => (
    <TouchableOpacity style={styles.attachmentOption} activeOpacity={0.7}>
      <View style={[styles.attachmentIconContainer, { backgroundColor: color }]}>
        <Ionicons name={icon} size={26} color="#FFF" />
      </View>
      <Text style={styles.attachmentLabel}>{label}</Text>
    </TouchableOpacity>
  );

  const renderMessage = ({ item }: { item: typeof MESSAGES[0] }) => {
    const isMe = item.sender === 'me';
    return (
      <View style={[styles.messageWrapper, isMe ? styles.myMessageWrapper : styles.otherMessageWrapper]}>
        <View style={[styles.messageBubble, isMe ? styles.myBubble : styles.otherBubble]}>
          <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.otherMessageText]}>
            {item.text}
          </Text>
        </View>
        <View style={[styles.timeContainer, isMe ? styles.myTimeContainer : styles.otherTimeContainer]}>
          <Text style={styles.timeText}>{item.time}</Text>
          {isMe && item.status === 'read' && (
            <Ionicons name="checkmark-done" size={16} color="#1B54E6" style={styles.checkIcon} />
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      
      {/* Header with status bar padding */}
      <View style={[styles.headerWrapper, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
          
          <View style={styles.userInfo}>
            <View style={styles.avatarContainer}>
              <Image 
                source={{ uri: (image as string) || 'https://i.pravatar.cc/150?u=niki' }} 
                style={styles.avatar} 
              />
              <View style={styles.statusDot} />
            </View>
            <Text style={styles.userName}>{(name as string) || 'nikizefanya'}</Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.actionIcon}>
              <Ionicons name="videocam-outline" size={22} color="#000" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionIcon}>
              <Ionicons name="call-outline" size={20} color="#000" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionIcon}>
              <Ionicons name="ellipsis-vertical" size={20} color="#000" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={[...MESSAGES].reverse()}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
        inverted
        ListFooterComponent={() => (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateText}>Hoje</Text>
          </View>
        )}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.footer}>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => {
              Keyboard.dismiss();
              setAttachmentModalVisible(!attachmentModalVisible);
            }}
          >
            <Ionicons name={attachmentModalVisible ? "close" : "add"} size={24} color="#000" />
          </TouchableOpacity>
          
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Digite uma mensagem"
              value={message}
              onChangeText={setMessage}
              placeholderTextColor="#8E8E93"
              onFocus={() => setAttachmentModalVisible(false)}
            />
            <TouchableOpacity style={styles.inputIcon}>
              <Ionicons name="mic-outline" size={22} color="#8E8E93" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.sendButton}>
            <Ionicons name="send" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      <View style={{ height: insets.bottom, backgroundColor: '#FFF' }} />

      {/* Attachment Overlay & Sheet */}
      {attachmentModalVisible && (
        <Animated.View 
          entering={FadeIn.duration(300)} 
          exiting={FadeOut.duration(300)}
          style={[styles.absoluteOverlay, { top: insets.top + 60, bottom: insets.bottom + 60 }]}
        >
          <TouchableOpacity 
            style={styles.blurArea} 
            activeOpacity={1} 
            onPress={() => setAttachmentModalVisible(false)}
          />
          <View style={styles.attachmentModalContent}>
            <View style={styles.dragHandle} />
            <View style={styles.attachmentGrid}>
              <AttachmentOption icon="document-text" label="Documento" color="#7F66FF" />
              <AttachmentOption icon="camera" label="Câmera" color="#FF4B7D" />
              <AttachmentOption icon="image" label="Galeria" color="#BF5AF2" />
              <AttachmentOption icon="headset" label="Áudio" color="#FF9500" />
              <AttachmentOption icon="location" label="Localização" color="#34C759" />
              <AttachmentOption icon="person" label="Contato" color="#007AFF" />
              <AttachmentOption icon="bar-chart" label="Enquete" color="#FFCC00" />
              <AttachmentOption icon="happy" label="GIF" color="#5AC8FA" />
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5', // Slightly off-white background like the image
  },
  headerWrapper: {
    backgroundColor: '#FFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 60,
    backgroundColor: '#FFF',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  statusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34C759',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIcon: {
    marginLeft: 15,
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 20,
  },
  dateText: {
    fontSize: 12,
    color: '#8E8E93',
    backgroundColor: '#E0E0E0',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  messageList: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  messageWrapper: {
    marginBottom: 16,
    maxWidth: '85%',
  },
  myMessageWrapper: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  otherMessageWrapper: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
  },
  myBubble: {
    backgroundColor: '#1B54E6',
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: '#FFF',
    borderBottomLeftRadius: 4,
    borderWidth: 0.5,
    borderColor: '#E0E0E0',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  myMessageText: {
    color: '#FFF',
  },
  otherMessageText: {
    color: '#000',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  myTimeContainer: {
    justifyContent: 'flex-end',
  },
  otherTimeContainer: {
    justifyContent: 'flex-start',
  },
  timeText: {
    fontSize: 11,
    color: '#8E8E93',
  },
  checkIcon: {
    marginLeft: 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFF',
    borderTopWidth: 0.5,
    borderTopColor: '#E0E0E0',
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 22,
    paddingHorizontal: 15,
    height: 40,
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#000',
    paddingVertical: 0,
  },
  inputIcon: {
    marginLeft: 5,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  absoluteOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    justifyContent: 'flex-end',
  },
  blurArea: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  attachmentModalContent: {
    backgroundColor: '#FFF',
    borderRadius: 30,
    paddingTop: 15,
    paddingHorizontal: 20,
    marginHorizontal: 10,
    marginBottom: 10,
    // Add shadow to make it pop
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  dragHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#E0E0E0',
    borderRadius: 2.5,
    alignSelf: 'center',
    marginBottom: 20,
  },
  attachmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  attachmentOption: {
    width: '25%',
    alignItems: 'center',
    marginBottom: 20,
  },
  attachmentIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  attachmentLabel: {
    fontSize: 12,
    color: '#000',
  },
});

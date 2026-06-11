import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import * as Haptics from 'expo-haptics';

interface StatusUpdate {
  id: string;
  name: string;
  avatar: string | null;
  time: string;
  content: string;
  type: 'image' | 'text';
  backgroundColor?: string;
  viewed: boolean;
}

const MOCK_STATUSES: StatusUpdate[] = [
  {
    id: '1',
    name: 'Terry',
    avatar: 'https://i.pravatar.cc/150?u=terry',
    time: 'Há 12 min',
    content: '☕ Começando o dia da melhor forma!',
    type: 'text',
    backgroundColor: '#6B4EFF',
    viewed: false,
  },
  {
    id: '2',
    name: 'Sarah',
    avatar: 'https://i.pravatar.cc/150?u=sarah',
    time: 'Há 1 hora',
    content: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&q=80',
    type: 'image',
    viewed: false,
  },
  {
    id: '3',
    name: 'Nolan',
    avatar: 'https://i.pravatar.cc/150?u=nolan',
    time: 'Há 3 horas',
    content: '🚀 Codando sem parar nesse novo app!',
    type: 'text',
    backgroundColor: '#00C781',
    viewed: false,
  },
  {
    id: '4',
    name: 'Roger',
    avatar: 'https://i.pravatar.cc/150?u=roger',
    time: 'Hoje, 09:15',
    content: 'Trabalho com vista para o mar hoje 🌊',
    type: 'text',
    backgroundColor: '#FF5A5F',
    viewed: true,
  },
  {
    id: '5',
    name: 'Craig',
    avatar: 'https://i.pravatar.cc/150?u=craig',
    time: 'Ontem, 21:40',
    content: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=500&q=80',
    type: 'image',
    viewed: true,
  },
];

export default function StoriesScreen() {
  const { user } = useAuth();
  const [statuses, setStatuses] = useState<StatusUpdate[]>(MOCK_STATUSES);
  const [activeStatus, setActiveStatus] = useState<StatusUpdate | null>(null);
  const [progress, setProgress] = useState(0);

  // Auto-advance or close status after 4 seconds
  useEffect(() => {
    let timer: NodeJS.Timeout;
    let progressTimer: NodeJS.Timeout;

    if (activeStatus) {
      setProgress(0);
      
      // Update progress bar
      const intervalTime = 40; // 40ms * 100 = 4000ms (4s)
      progressTimer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 1) {
            clearInterval(progressTimer);
            return 1;
          }
          return prev + 0.01;
        });
      }, intervalTime);

      timer = setTimeout(() => {
        handleCloseStatus();
      }, 4000);
    }

    return () => {
      clearTimeout(timer);
      clearInterval(progressTimer);
    };
  }, [activeStatus]);

  const handleOpenStatus = (status: StatusUpdate) => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    setActiveStatus(status);
    
    // Mark status as viewed locally
    setStatuses((prev) =>
      prev.map((s) => (s.id === status.id ? { ...s, viewed: true } : s))
    );
  };

  const handleCloseStatus = () => {
    setActiveStatus(null);
    setProgress(0);
  };

  const handlePrivacyPress = () => {
    Alert.alert(
      'Privacidade do Status',
      'Escolha quem pode ver suas atualizações:\n\n• Meus contatos\n• Meus contatos, exceto...\n• Compartilhar apenas com...'
    );
  };

  const recentUpdates = statuses.filter((s) => !s.viewed);
  const viewedUpdates = statuses.filter((s) => s.viewed);

  const userDisplayName = user
    ? `${user.name || ''} ${user.surname || ''}`.trim() || 'Meu status'
    : 'Meu status';
  const userAvatar = user?.profile_photo || null;

  const userInitials = userDisplayName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Status</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerButton} onPress={handlePrivacyPress}>
            <Ionicons name="shield-checkmark-outline" size={22} color="#000" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* My Status Section */}
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.myStatusRow}
            activeOpacity={0.7}
            onPress={() => {
              Alert.alert('Novo Status', 'Funcionalidade de publicação será implementada em breve.');
            }}
          >
            <View style={styles.avatarWrapper}>
              {userAvatar ? (
                <Image source={{ uri: userAvatar }} style={styles.myAvatar} />
              ) : (
                <View style={[styles.myAvatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitials}>{userInitials || 'M'}</Text>
                </View>
              )}
              <View style={styles.addBadge}>
                <Ionicons name="add" size={14} color="#FFF" />
              </View>
            </View>

            <View style={styles.myStatusInfo}>
              <Text style={styles.myStatusTitle}>Meu status</Text>
              <Text style={styles.myStatusSubtitle}>Adicionar à minha atualização</Text>
            </View>

            <View style={styles.myStatusActions}>
              <TouchableOpacity
                style={styles.actionIconButton}
                onPress={() => Alert.alert('Câmara', 'Abrir câmara do dispositivo')}
              >
                <Ionicons name="camera" size={20} color="#8E8E93" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionIconButton}
                onPress={() => Alert.alert('Texto', 'Escrever atualização de texto')}
              >
                <Ionicons name="pencil" size={20} color="#8E8E93" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>

        {/* Recent Updates Section */}
        {recentUpdates.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ATUALIZAÇÕES RECENTES</Text>
            <View style={styles.sectionCard}>
              {recentUpdates.map((item, index) => (
                <View key={item.id}>
                  <TouchableOpacity
                    style={styles.statusItem}
                    activeOpacity={0.6}
                    onPress={() => handleOpenStatus(item)}
                  >
                    <View style={styles.ringContainer}>
                      <View style={[styles.statusRing, styles.activeRing]}>
                        {item.avatar ? (
                          <Image source={{ uri: item.avatar }} style={styles.statusAvatar} />
                        ) : (
                          <View style={[styles.statusAvatar, styles.avatarPlaceholder]}>
                            <Ionicons name="person" size={20} color="#8E8E93" />
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={styles.statusInfo}>
                      <Text style={styles.statusName}>{item.name}</Text>
                      <Text style={styles.statusTime}>{item.time}</Text>
                    </View>
                  </TouchableOpacity>
                  {index < recentUpdates.length - 1 && <View style={styles.separator} />}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Viewed Updates Section */}
        {viewedUpdates.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ATUALIZAÇÕES VISTAS</Text>
            <View style={styles.sectionCard}>
              {viewedUpdates.map((item, index) => (
                <View key={item.id}>
                  <TouchableOpacity
                    style={styles.statusItem}
                    activeOpacity={0.6}
                    onPress={() => handleOpenStatus(item)}
                  >
                    <View style={styles.ringContainer}>
                      <View style={[styles.statusRing, styles.viewedRing]}>
                        {item.avatar ? (
                          <Image source={{ uri: item.avatar }} style={styles.statusAvatar} />
                        ) : (
                          <View style={[styles.statusAvatar, styles.avatarPlaceholder]}>
                            <Ionicons name="person" size={20} color="#8E8E93" />
                          </View>
                        )}
                      </View>
                    </View>

                    <View style={styles.statusInfo}>
                      <Text style={styles.statusName}>{item.name}</Text>
                      <Text style={styles.statusTime}>{item.time}</Text>
                    </View>
                  </TouchableOpacity>
                  {index < viewedUpdates.length - 1 && <View style={styles.separator} />}
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Full-Screen Status Viewer Overlay */}
      {activeStatus && (
        <View style={styles.viewerContainer}>
          {/* Progress Indicators */}
          <View style={styles.progressBarWrapper}>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
            </View>
          </View>

          {/* Viewer Header */}
          <View style={styles.viewerHeader}>
            <View style={styles.viewerUserInfo}>
              {activeStatus.avatar ? (
                <Image source={{ uri: activeStatus.avatar }} style={styles.viewerAvatar} />
              ) : (
                <View style={[styles.viewerAvatar, styles.avatarPlaceholder]}>
                  <Ionicons name="person" size={16} color="#8E8E93" />
                </View>
              )}
              <View>
                <Text style={styles.viewerName}>{activeStatus.name}</Text>
                <Text style={styles.viewerTime}>{activeStatus.time}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={handleCloseStatus}>
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Viewer Content */}
          <View style={styles.viewerContent}>
            {activeStatus.type === 'text' ? (
              <View style={[styles.textStatusBg, { backgroundColor: activeStatus.backgroundColor || '#000000' }]}>
                <Text style={styles.textStatusText}>{activeStatus.content}</Text>
              </View>
            ) : (
              <Image
                source={{ uri: activeStatus.content }}
                style={styles.imageStatus}
                contentFit="contain"
              />
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    height: 70,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E8E8ED',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#000',
  },
  headerActions: {
    flexDirection: 'row',
  },
  headerButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 22,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A8A8E',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 6,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  myStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  avatarWrapper: {
    position: 'relative',
  },
  myAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarFallback: {
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '700',
  },
  addBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#34C759',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  myStatusInfo: {
    flex: 1,
    marginLeft: 14,
  },
  myStatusTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0D0D0D',
  },
  myStatusSubtitle: {
    fontSize: 14,
    color: '#8A8A8E',
    marginTop: 2,
  },
  myStatusActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  ringContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  activeRing: {
    borderColor: '#34C759', // WhatsApp active green
  },
  viewedRing: {
    borderColor: '#D1D1D6', // Seen gray
  },
  statusAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  avatarPlaceholder: {
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusInfo: {
    flex: 1,
    marginLeft: 14,
  },
  statusName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0D0D0D',
  },
  statusTime: {
    fontSize: 13,
    color: '#8A8A8E',
    marginTop: 2,
  },
  separator: {
    height: 0.5,
    backgroundColor: '#E5E5EA',
    marginLeft: 82,
  },
  // Viewer Overlay Styles
  viewerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 9999,
  },
  progressBarWrapper: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 30,
    left: 10,
    right: 10,
    height: 4,
    zIndex: 10001,
  },
  progressBarBg: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
  viewerHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 74 : 44,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10001,
  },
  viewerUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  viewerName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  viewerTime: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    marginTop: 1,
  },
  closeButton: {
    padding: 4,
  },
  viewerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textStatusBg: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  textStatusText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 36,
  },
  imageStatus: {
    width: '100%',
    height: '100%',
  },
});

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  Alert,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '@/context/AuthContext';
import axiosInstance from '@/utils/axiosInstance';
import { useFocusEffect } from 'expo-router';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  bg: '#F7F7F7',
  surface: '#FFFFFF',
  accent: '#000000',
  textPrimary: '#0D0D0D',
  textSecondary: '#8A8A8E',
  separator: '#E8E8ED',
  destructive: '#FF3B30',
  green: '#34C759',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  label: string;
  value?: string;
  showArrow?: boolean;
  isSwitch?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (v: boolean) => void;
  onPress?: () => void;
  destructive?: boolean;
}

// ─── Setting Row Component ────────────────────────────────────────────────────
function SettingRow({
  icon,
  iconBg,
  label,
  value,
  showArrow = true,
  isSwitch,
  switchValue,
  onSwitchChange,
  onPress,
  destructive,
}: SettingRowProps) {
  return (
    <TouchableOpacity
      style={styles.settingRow}
      onPress={onPress}
      activeOpacity={isSwitch ? 1 : 0.6}
      disabled={isSwitch}
    >
      <View style={[styles.settingIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color="#FFF" />
      </View>

      <View style={styles.settingContent}>
        <Text style={[styles.settingLabel, destructive && { color: C.destructive }]}>
          {label}
        </Text>
        <View style={styles.settingRight}>
          {value ? <Text style={styles.settingValue}>{value}</Text> : null}
          {isSwitch ? (
            <Switch
              value={switchValue}
              onValueChange={onSwitchChange}
              trackColor={{ false: '#D1D1D6', true: C.accent }}
              thumbColor="#FFF"
              ios_backgroundColor="#D1D1D6"
            />
          ) : showArrow ? (
            <Ionicons name="chevron-forward" size={16} color={C.textSecondary} />
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Section Component ────────────────────────────────────────────────────────
function Section({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { user, signOut, refreshUser } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [readReceipts, setReadReceipts] = useState(true);
  const [onlineStatus, setOnlineStatus] = useState(true);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const serverUri = process.env.EXPO_PUBLIC_SERVER_URI;

  const fetchProfile = async () => {
    if (!user?.id) return;
    try {
      setRefreshing(true);
      await refreshUser();
    } catch (error) {
      console.error('Error refreshing profile:', error);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      fetchProfile();
    }, [user?.id])
  );

  const avatarUrl = localAvatar
    ? localAvatar
    : user?.profile_photo || null;

  const displayName = user
    ? `${user.name || ''} ${user.surname || ''}`.trim() || 'Utilizador'
    : 'Utilizador';

  const phoneDisplay = user?.phone_number || '';
  const copyToClipboard = async (text: string) => {
    if (!text) return;
    await Clipboard.setStringAsync(text);
    Alert.alert('Copiado', 'Número de telemóvel copiado para a área de transferência.');
  };

  const handlePickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Precisa permitir o acesso à galeria.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: false,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setLocalAvatar(asset.uri);

    try {
      setUploadingAvatar(true);
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      const mimeType = asset.mimeType ?? `image/${ext}`;

      const formData = new FormData();
      formData.append('avatar', { uri: asset.uri, name: `avatar.${ext}`, type: mimeType } as any);
      formData.append('account_id', String(user?.id));

      await axiosInstance.post('/api/v1/auth/update-avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      // Refresh profile data after upload
      fetchProfile();
    } catch (e) {
      console.error('Avatar upload error:', e);
      Alert.alert('Erro', 'Não foi possível actualizar a foto.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Terminar Sessão', 'Tens a certeza que queres sair?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: () => signOut(),
      },
    ]);
  };

  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Perfil</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Avatar (flat, no card) ──────────────────────────────────────── */}
        <View style={styles.avatarSection}>
          <TouchableOpacity style={styles.avatarTouchable} onPress={handlePickAvatar} activeOpacity={0.85}>
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatar}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}

            {/* Camera overlay */}
            <View style={styles.cameraOverlay}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="camera" size={18} color="#FFF" />
              )}
            </View>
          </TouchableOpacity>

          <Text style={styles.displayName}>{displayName}</Text>
          
          <View style={styles.phoneContainer}>
            <Text style={styles.phone}>{phoneDisplay}</Text>
            <TouchableOpacity 
              onPress={() => copyToClipboard(phoneDisplay)}
              style={styles.copyIcon}
            >
              <Ionicons name="copy-outline" size={16} color={C.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Status ─────────────────────────────────────────────────────── */}
            <Section title="SOBRE">
              <SettingRow
                icon="pencil-outline"
                iconBg="#5856D6"
                label="Estado"
                value="Disponível 🟢"
                onPress={() => {}}
              />
            </Section>

            {/* ── Privacidade & Segurança ─────────────────────────────────────── */}
            <Section title="PRIVACIDADE">
              <SettingRow
                icon="eye-outline"
                iconBg="#007AFF"
                label="Visto por último"
                value="Todos"
                onPress={() => {}}
              />
              <View style={styles.rowSep} />
              <SettingRow
                icon="checkmark-done-outline"
                iconBg="#34C759"
                label="Confirmações de leitura"
                isSwitch
                switchValue={readReceipts}
                onSwitchChange={setReadReceipts}
              />
              <View style={styles.rowSep} />
              <SettingRow
                icon="radio-outline"
                iconBg="#FF9500"
                label="Mostrar online"
                isSwitch
                switchValue={onlineStatus}
                onSwitchChange={setOnlineStatus}
              />
              <View style={styles.rowSep} />
              <SettingRow
                icon="lock-closed-outline"
                iconBg="#FF2D55"
                label="Bloqueio por PIN / Biometria"
                onPress={() => {}}
              />
            </Section>

            {/* ── Notificações ───────────────────────────────────────────────── */}
            <Section title="NOTIFICAÇÕES">
              <SettingRow
                icon="notifications-outline"
                iconBg="#FF9500"
                label="Notificações"
                isSwitch
                switchValue={notificationsEnabled}
                onSwitchChange={setNotificationsEnabled}
              />
              <View style={styles.rowSep} />
              <SettingRow
                icon="volume-high-outline"
                iconBg="#5AC8FA"
                label="Som das mensagens"
                value="Padrão"
                onPress={() => {}}
              />
            </Section>

            {/* ── Armazenamento ──────────────────────────────────────────────── */}
            <Section title="DADOS E ARMAZENAMENTO">
              <SettingRow
                icon="server-outline"
                iconBg="#30B0C7"
                label="Uso de armazenamento"
                value="245 MB"
                onPress={() => {}}
              />
              <View style={styles.rowSep} />
              <SettingRow
                icon="cloud-download-outline"
                iconBg="#34C759"
                label="Download automático"
                value="Wi-Fi"
                onPress={() => {}}
              />
            </Section>

            {/* ── Suporte ────────────────────────────────────────────────────── */}
            <Section title="AJUDA">
              <SettingRow
                icon="help-circle-outline"
                iconBg="#636366"
                label="Central de Ajuda"
                onPress={() => {}}
              />
              <View style={styles.rowSep} />
              <SettingRow
                icon="document-text-outline"
                iconBg="#636366"
                label="Política de Privacidade"
                onPress={() => {}}
              />
              <View style={styles.rowSep} />
              <SettingRow
                icon="information-circle-outline"
                iconBg="#636366"
                label="Sobre o Massoko"
                value="v1.0.0"
                onPress={() => {}}
              />
            </Section>

            {/* ── Logout ─────────────────────────────────────────────────────── */}
            <Section>
              <SettingRow
                icon="log-out-outline"
                iconBg={C.destructive}
                label="Terminar Sessão"
                showArrow={false}
                destructive
                onPress={handleSignOut}
              />
            </Section>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const AVATAR_SIZE = 110;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // ── Header
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: C.bg,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: C.textPrimary,
    letterSpacing: -0.2,
  },

  scroll: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },

  // ── Avatar Section (flat — no card)
  avatarSection: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 32,
  },
  avatarTouchable: {
    position: 'relative',
    marginBottom: 18,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: {
    backgroundColor: '#D0D0D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 38,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 1,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#8A8A8E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.bg,
  },
  displayName: {
    fontSize: 22,
    fontWeight: '700',
    color: C.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 5,
  },
  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  phone: {
    fontSize: 14,
    color: C.textSecondary,
  },
  copyIcon: {
    padding: 4,
  },

  // ── Sections
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },

  // ── Setting Row
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    minHeight: 56,
  },
  settingIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  settingContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingLabel: {
    fontSize: 16,
    color: C.textPrimary,
    fontWeight: '400',
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  settingValue: {
    fontSize: 14,
    color: C.textSecondary,
  },
  rowSep: {
    height: 1,
    backgroundColor: C.separator,
    marginLeft: 62,
  },
});

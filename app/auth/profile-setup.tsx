import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Image,
  StatusBar,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import axiosInstance from '@/utils/axiosInstance';
import * as SecureStore from 'expo-secure-store';
import { setAccessToken } from '@/utils/tokenStorage';

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const [image, setImage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const surnameRef = useRef<TextInput>(null);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert(
        'Permissão necessária',
        'Precisamos de acesso às suas fotos para você escolher uma foto de perfil.',
        [{ text: 'OK' }]
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleComplete = async () => {
    if (!name.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Aviso', 'Por favor, insira o seu nome.');
      return;
    }

    if (!accountId) {
      Alert.alert('Erro', 'ID da conta não encontrado. Por favor, reinicie o processo.');
      return;
    }

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const formData = new FormData();
      formData.append('account_id', accountId);
      formData.append('name', name);
      formData.append('surname', surname);

      if (image) {
        const uriParts = image.split('/');
        const fileName = uriParts[uriParts.length - 1];
        const match = /\.([0-9a-z]+)(?:[?#]|$)/i.exec(fileName);
        const ext = match ? match[1].toLowerCase() : 'jpg';
        const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

        // @ts-ignore
        formData.append('avatar', {
          uri: image,
          name: fileName,
          type: mimeType,
        });
      }

      const response = await axiosInstance.post('/api/v1/auth/finalize-registration', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const data = response.data;

      if (data.success) {
        if (data.tokens && data.user) {
          // Store tokens in secure store so permissions screen can finalise sign-in
          setAccessToken(data.tokens.access_token);
          await SecureStore.setItemAsync('access_token', data.tokens.access_token);
          await SecureStore.setItemAsync('refresh_token', data.tokens.refresh_token);
          await SecureStore.setItemAsync('user', JSON.stringify(data.user));

          // Navigate to permissions; pass tokens + user so the loader can call signIn()
          router.replace({
            pathname: '/auth/permissions',
            params: {
              accessToken: data.tokens.access_token,
              refreshToken: data.tokens.refresh_token,
              userData: JSON.stringify(data.user),
            },
          });
        } else {
          router.replace('/auth/permissions');
        }
      } else {
        Alert.alert('Erro', data.message || 'Falha ao finalizar o cadastro.');
      }
    } catch (error: any) {
      console.error('Finalize registration error:', error);
      Alert.alert(
        'Erro',
        error.response?.data?.message || 'Ocorreu um erro ao finalizar o perfil.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const canProceed = name.trim().length > 0 && !isLoading;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top bar: back + title + Next */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={26} color="#007AFF" />
        </TouchableOpacity>

        <Text style={styles.topTitle}>Configurar perfil</Text>

        <TouchableOpacity
          onPress={handleComplete}
          disabled={!canProceed}
          activeOpacity={0.7}
          style={[styles.nextBtn, canProceed && styles.nextBtnActive]}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={[styles.nextBtnText, canProceed && styles.nextBtnTextActive]}>
              Próximo
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Subtitle */}
          <Text style={styles.subtitle}>
            Os perfis são visíveis para as pessoas com quem você troca mensagens, contactos e grupos.{' '}
            <Text style={styles.learnMore}>Saiba mais</Text>
          </Text>

          {/* Avatar picker */}
          <View style={styles.avatarWrap}>
            <TouchableOpacity onPress={pickImage} activeOpacity={0.8} style={styles.avatarBtn}>
              {image ? (
                <Image source={{ uri: image }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={54} color="#BDBDBD" />
                </View>
              )}
              {/* Camera badge */}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={14} color="#555" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Input card */}
          <View style={styles.inputCard}>
            <TextInput
              style={styles.textInput}
              placeholder="Nome"
              placeholderTextColor="#C7C7CC"
              value={name}
              onChangeText={setName}
              returnKeyType="next"
              onSubmitEditing={() => surnameRef.current?.focus()}
              blurOnSubmit={false}
            />
            <View style={styles.inputDivider} />
            <TextInput
              ref={surnameRef}
              style={styles.textInput}
              placeholder="Apelido (opcional)"
              placeholderTextColor="#C7C7CC"
              value={surname}
              onChangeText={setSurname}
              returnKeyType="done"
              onSubmitEditing={canProceed ? handleComplete : undefined}
            />
          </View>

          {/* Who can find me row */}
          <TouchableOpacity style={styles.findMeRow} activeOpacity={0.7}>
            <View style={styles.findMeLeft}>
              <Ionicons name="people-outline" size={22} color="#555" style={{ marginRight: 14 }} />
              <View>
                <Text style={styles.findMeTitle}>Quem pode encontrar-me pelo número?</Text>
                <Text style={styles.findMeValue}>Todos</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#C7C7CC" />
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  /* ── Top bar ── */
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  nextBtn: {
    minWidth: 72,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  nextBtnActive: {
    backgroundColor: '#007AFF',
  },
  nextBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8E8E93',
  },
  nextBtnTextActive: {
    color: '#FFFFFF',
  },
  /* ── Scroll content ── */
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
    paddingHorizontal: 16,
  },
  learnMore: {
    color: '#007AFF',
  },
  /* ── Avatar ── */
  avatarWrap: {
    alignItems: 'center',
    marginBottom: 36,
  },
  avatarBtn: {
    width: 100,
    height: 100,
    borderRadius: 50,
    position: 'relative',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#E8EAF0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#D1D1D6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  /* ── Input card ── */
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  textInput: {
    height: 50,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#000',
  },
  inputDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E0E0E0',
    marginLeft: 16,
  },
  /* ── Find me row ── */
  findMeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E0E0E0',
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  findMeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  findMeTitle: {
    fontSize: 15,
    color: '#000',
    marginBottom: 2,
  },
  findMeValue: {
    fontSize: 13,
    color: '#8E8E93',
  },
});

import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import axiosInstance from '@/utils/axiosInstance';
import { useAuth } from '@/context/AuthContext';

const BRIGHT_BLACK = '#000000';

export default function ProfileSetupScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const [image, setImage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const pickImage = async () => {
    // Request permissions
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        'Permissão necessária',
        'Precisamos de acesso às suas fotos para você escolher uma foto de perfil.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Open picker
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
      Alert.alert('Aviso', 'Por favor, insira o seu nome principal.');
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
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const data = response.data;

      if (data.success) {
        // Sign in with the returned tokens and user data
        if (data.tokens && data.user) {
          await signIn(data.tokens, data.user);
          // Redirect is handled by AuthContext (listening to user state)
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <View style={styles.backCircle}>
                <Ionicons name="arrow-back" size={24} color="#1E2D4D" />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.innerContent}>
            {/* Title Section */}
            <View style={styles.titleSection}>
              <Text style={styles.title}>Finalize seu Perfil</Text>
              <Text style={styles.subtitle}>
                Não se preocupe, apenas você pode ver seus dados pessoais. Ninguém mais poderá vê-los.
              </Text>
            </View>

            {/* Profile Image Picker */}
            <View style={styles.imagePickerWrap}>
              <TouchableOpacity 
                onPress={pickImage} 
                activeOpacity={0.8}
                style={styles.imageButton}
              >
                {image ? (
                  <Image source={{ uri: image }} style={styles.profileImage} />
                ) : (
                  <View style={styles.placeholderContainer}>
                    <Ionicons name="person-outline" size={60} color="#007AFF" />
                  </View>
                )}
                
                <View style={styles.editBadge}>
                  <Ionicons name="pencil" size={14} color="#FFF" />
                </View>
              </TouchableOpacity>
            </View>

            {/* Form Fields */}
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Nome principal</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex. João Silva"
                  value={name}
                  onChangeText={setName}
                  placeholderTextColor="#C7C7CC"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Apelido / Sobrenome</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex. Silva"
                  value={surname}
                  onChangeText={setSurname}
                  placeholderTextColor="#C7C7CC"
                />
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.completeButton, (!name.trim() || isLoading) && styles.completeButtonDisabled]} 
              onPress={handleComplete}
              disabled={!name.trim() || isLoading}
              activeOpacity={0.8}
            >
              <Text style={[styles.completeButtonText, (!name.trim() || isLoading) && styles.completeButtonTextDisabled]}>
                {isLoading ? 'Finalizando...' : 'Completar perfil'}
              </Text>
            </TouchableOpacity>
          </View>
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
  header: {
    paddingHorizontal: 16,
    height: 60,
    justifyContent: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
  },
  innerContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 40,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1E2D4D',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  imagePickerWrap: {
    alignItems: 'center',
    marginBottom: 40,
  },
  imageButton: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  profileImage: {
    width: 140,
    height: 140,
    borderRadius: 70,
  },
  placeholderContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BRIGHT_BLACK,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFF',
  },
  form: {
    gap: 20,
    marginBottom: 40,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E2D4D',
  },
  input: {
    backgroundColor: '#F8F8F8',
    height: 54,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#000',
  },
  completeButton: {
    backgroundColor: BRIGHT_BLACK,
    height: 56,
    borderRadius: 12, // Standardized
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: 20,
    shadowColor: BRIGHT_BLACK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  completeButtonDisabled: {
    backgroundColor: '#E5E5EA',
    shadowOpacity: 0,
    elevation: 0,
  },
  completeButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFF',
  },
  completeButtonTextDisabled: {
    color: '#8E8E93',
  },
});

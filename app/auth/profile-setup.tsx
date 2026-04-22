import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Image,
  SafeAreaView,
  StatusBar,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

const BRIGHT_BLACK = '#000000';

export default function ProfileSetupScreen() {
  const router = useRouter();
  const [image, setImage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');

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

  const handleComplete = () => {
    if (!name.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Aviso', 'Por favor, insira o seu nome principal.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Navigate to the permissions screen
    router.replace('/auth/permissions');
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
                <Text style={styles.label}>Apelido (Opcional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex. JS"
                  value={nickname}
                  onChangeText={setNickname}
                  placeholderTextColor="#C7C7CC"
                />
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.completeButton, !name.trim() && styles.completeButtonDisabled]} 
              onPress={handleComplete}
              disabled={!name.trim()}
              activeOpacity={0.8}
            >
              <Text style={[styles.completeButtonText, !name.trim() && styles.completeButtonTextDisabled]}>Completar perfil</Text>
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

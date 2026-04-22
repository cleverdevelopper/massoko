import React, { useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withDelay, 
  withTiming, 
  Easing 
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');
const BRIGHT_BLACK = '#000000';

export default function PermissionsScreen() {
  const router = useRouter();

  // Animation values for staggered entrance
  const card1Offset = useSharedValue(-50);
  const card1Opacity = useSharedValue(0);
  const card2Offset = useSharedValue(-50);
  const card2Opacity = useSharedValue(0);

  useEffect(() => {
    // Staggered animation: Card 1 starts at 100ms, Card 2 at 300ms
    card1Offset.value = withDelay(100, withTiming(0, { duration: 600, easing: Easing.out(Easing.exp) }));
    card1Opacity.value = withDelay(100, withTiming(1, { duration: 600 }));

    card2Offset.value = withDelay(300, withTiming(0, { duration: 600, easing: Easing.out(Easing.exp) }));
    card2Opacity.value = withDelay(300, withTiming(1, { duration: 600 }));
  }, []);

  const animatedStyle1 = useAnimatedStyle(() => ({
    transform: [{ translateY: card1Offset.value }],
    opacity: card1Opacity.value,
  }));

  const animatedStyle2 = useAnimatedStyle(() => ({
    transform: [{ translateY: card2Offset.value }],
    opacity: card2Opacity.value,
  }));

  const handlePermissions = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // 1. Request Contacts Permission
      await Contacts.requestPermissionsAsync();

      // 2. Request Notifications Permission
      await Notifications.requestPermissionsAsync();
    } catch (error) {
      console.log('Error requesting permissions:', error);
    } finally {
      // Navigate to main app regardless of outcome for mock flow
      router.replace('/(tabs)');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#1E2D4D" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Permissões</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.titleSection}>
          <Text style={styles.title}>Acesso e Notificações</Text>
          <Text style={styles.subtitle}>
            Para garantir que você não perca nenhuma atualização e possa encontrar seus amigos rapidamente.
          </Text>
        </View>

        {/* Permission Cards */}
        <View style={styles.cardsContainer}>
          
          {/* Card 1: Contacts */}
          <Animated.View style={[styles.card, animatedStyle1]}>
            <View style={styles.iconContainer}>
              <View style={[styles.iconCircle, { backgroundColor: '#E8F2FF' }]}>
                <Ionicons name="people" size={24} color={BRIGHT_BLACK} />
              </View>
            </View>
            <View style={styles.cardTextContainer}>
              <Text style={styles.cardTitle}>Sincronizar Contatos</Text>
              <Text style={styles.cardDescription}>Encontre amigos que já usam o Masoko e facilite a troca de mensagens.</Text>
            </View>
          </Animated.View>

          {/* Card 2: Notifications */}
          <Animated.View style={[styles.card, animatedStyle2]}>
            <View style={styles.iconContainer}>
              <View style={[styles.iconCircle, { backgroundColor: '#F0F9ED' }]}>
                <Ionicons name="notifications" size={24} color="#34C759" />
              </View>
            </View>
            <View style={styles.cardTextContainer}>
              <Text style={styles.cardTitle}>Notificações Push</Text>
              <Text style={styles.cardDescription}>Receba alertas em tempo real sobre novas mensagens e interações.</Text>
            </View>
          </Animated.View>

        </View>

        {/* Footer Action */}
        <TouchableOpacity 
          style={styles.actionButton} 
          onPress={handlePermissions}
          activeOpacity={0.8}
        >
          <Text style={styles.actionButtonText}>Aceitar e começar</Text>
        </TouchableOpacity>
      </View>
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
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E2D4D',
    marginLeft: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  titleSection: {
    marginBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E2D4D',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: '#8E8E93',
    lineHeight: 22,
  },
  cardsContainer: {
    gap: 16,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F2F2F7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTextContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1E2D4D',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
  },
  actionButton: {
    backgroundColor: BRIGHT_BLACK,
    height: 56,
    borderRadius: 12, // Standardized
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: 32,
    shadowColor: BRIGHT_BLACK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  actionButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

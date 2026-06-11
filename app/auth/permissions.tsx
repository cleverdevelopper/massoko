import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts/legacy';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useAuth } from '@/context/AuthContext';

const BRIGHT_BLACK = '#000000';

// ─── Dot component for the animated loader ────────────────────────────────────
function PulseDot({ delay }: { delay: number }) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 500, easing: Easing.out(Easing.ease) }),
          withTiming(0.6, { duration: 500, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      )
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 500 }),
          withTiming(0.35, { duration: 500 })
        ),
        -1,
        false
      )
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.dot, style]} />;
}

// ─── Spinner ring ─────────────────────────────────────────────────────────────
function SpinnerRing() {
  const rotate = useSharedValue(0);

  useEffect(() => {
    rotate.value = withRepeat(
      withTiming(360, { duration: 1200, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));

  return (
    <Animated.View style={[styles.spinnerRing, style]}>
      <View style={styles.spinnerInner} />
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function PermissionsScreen() {
  const router = useRouter();
  const { finalizeSignIn } = useAuth();
  const params = useLocalSearchParams<{
    accessToken?: string;
    refreshToken?: string;
    userData?: string;
  }>();

  const [phase, setPhase] = useState<'permissions' | 'loading'>('permissions');
  const [loadingStep, setLoadingStep] = useState(0);

  // Animation values for staggered card entrance
  const card1Offset = useSharedValue(40);
  const card1Opacity = useSharedValue(0);
  const card2Offset = useSharedValue(40);
  const card2Opacity = useSharedValue(0);
  const card3Offset = useSharedValue(40);
  const card3Opacity = useSharedValue(0);

  // Loader overlay fade
  const loaderOpacity = useSharedValue(0);

  useEffect(() => {
    card1Offset.value = withDelay(100, withTiming(0, { duration: 600, easing: Easing.out(Easing.exp) }));
    card1Opacity.value = withDelay(100, withTiming(1, { duration: 600 }));

    card2Offset.value = withDelay(250, withTiming(0, { duration: 600, easing: Easing.out(Easing.exp) }));
    card2Opacity.value = withDelay(250, withTiming(1, { duration: 600 }));

    card3Offset.value = withDelay(400, withTiming(0, { duration: 600, easing: Easing.out(Easing.exp) }));
    card3Opacity.value = withDelay(400, withTiming(1, { duration: 600 }));
  }, []);

  const animStyle1 = useAnimatedStyle(() => ({
    transform: [{ translateY: card1Offset.value }],
    opacity: card1Opacity.value,
  }));
  const animStyle2 = useAnimatedStyle(() => ({
    transform: [{ translateY: card2Offset.value }],
    opacity: card2Opacity.value,
  }));
  const animStyle3 = useAnimatedStyle(() => ({
    transform: [{ translateY: card3Offset.value }],
    opacity: card3Opacity.value,
  }));
  const loaderStyle = useAnimatedStyle(() => ({
    opacity: loaderOpacity.value,
  }));

  const loadingSteps = [
    'A solicitar permissões…',
    'A configurar a sua conta…',
    'A gerar chaves de encriptação…',
    'A guardar chaves de encriptação…',
    'Quase pronto…',
  ];

  const handlePermissions = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Show loader overlay immediately
    setPhase('loading');
    loaderOpacity.value = withTiming(1, { duration: 300 });

    // Step 0 — request permissions
    setLoadingStep(0);
    try {
      await Contacts.requestPermissionsAsync();
      await Notifications.requestPermissionsAsync();
    } catch (_) {}

    // Step 1 — configuring
    setLoadingStep(1);
    await delay(500);

    if (params.accessToken && params.refreshToken && params.userData) {
      try {
        const tokens = {
          access_token: params.accessToken,
          refresh_token: params.refreshToken,
        };
        const user = JSON.parse(params.userData);

        // Step 2 — generating keys
        setLoadingStep(2);
        await delay(300);

        // Step 3 — uploading keys to backend
        setLoadingStep(3);

        // finalizeSignIn: registers device + uploads Signal keys BEFORE setUser()
        // Navigation to /(tabs) is triggered only AFTER setUser() runs at the end
        await finalizeSignIn(tokens, user);

        // Step 4 — done
        setLoadingStep(4);
        await delay(400);
      } catch (err) {
        console.error('[Permissions] finalizeSignIn failed:', err);
        // Even on error, navigate — keys can replenish next session
        router.replace('/(tabs)');
      }
    } else {
      // Fallback (no params — shouldn't normally happen)
      setLoadingStep(3);
      await delay(600);
      setLoadingStep(4);
      await delay(400);
      router.replace('/(tabs)');
    }
    // Navigation is handled by AuthContext route-protection effect (setUser called inside finalizeSignIn)
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ── Permissions content ── */}
      <View style={[styles.content, { opacity: phase === 'loading' ? 0 : 1 }]} pointerEvents={phase === 'loading' ? 'none' : 'auto'}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color="#1E2D4D" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Permissões</Text>
        </View>

        <View style={styles.inner}>
          <View style={styles.titleSection}>
            <View style={styles.lockIconWrap}>
              <Ionicons name="shield-checkmark" size={32} color="#007AFF" />
            </View>
            <Text style={styles.title}>Acesso e Notificações</Text>
            <Text style={styles.subtitle}>
              Para garantir que não perca nenhuma atualização e possa encontrar os seus contactos rapidamente.
            </Text>
          </View>

          {/* Permission cards */}
          <View style={styles.cardsContainer}>
            {/* Contacts */}
            <Animated.View style={[styles.card, animStyle1]}>
              <View style={[styles.iconCircle, { backgroundColor: '#EEF3FF' }]}>
                <Ionicons name="people" size={22} color="#007AFF" />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>Sincronizar Contactos</Text>
                <Text style={styles.cardDesc}>
                  Encontre amigos que já usam o Massoko e facilite a troca de mensagens.
                </Text>
              </View>
            </Animated.View>

            {/* Notifications */}
            <Animated.View style={[styles.card, animStyle2]}>
              <View style={[styles.iconCircle, { backgroundColor: '#F0FFF4' }]}>
                <Ionicons name="notifications" size={22} color="#34C759" />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>Notificações Push</Text>
                <Text style={styles.cardDesc}>
                  Receba alertas em tempo real sobre novas mensagens e interações.
                </Text>
              </View>
            </Animated.View>

            {/* Encryption notice */}
            <Animated.View style={[styles.card, styles.encryptionCard, animStyle3]}>
              <View style={[styles.iconCircle, { backgroundColor: '#FFF8EC' }]}>
                <Ionicons name="lock-closed" size={22} color="#FF9500" />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>Encriptação Ponta a Ponta</Text>
                <Text style={styles.cardDesc}>
                  As suas chaves de segurança serão geradas e armazenadas em seguida. Isso garante que apenas você leia as suas mensagens.
                </Text>
              </View>
            </Animated.View>
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handlePermissions}
            activeOpacity={0.85}
          >
            <Text style={styles.actionButtonText}>Aceitar e começar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Loading overlay ── */}
      {phase === 'loading' && (
        <Animated.View style={[styles.loaderOverlay, loaderStyle]}>
          <View style={styles.loaderContent}>
            {/* Spinner */}
            <SpinnerRing />

            <Text style={styles.loaderTitle}>Finalizando a criação da conta</Text>
            <Text style={styles.loaderStep}>{loadingSteps[loadingStep]}</Text>

            {/* Progress dots */}
            <View style={styles.dotsRow}>
              <PulseDot delay={0} />
              <PulseDot delay={200} />
              <PulseDot delay={400} />
            </View>

            <Text style={styles.loaderNote}>
              Por favor, aguarde. Não feche o aplicativo.
            </Text>
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  /* Permissions view */
  content: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 8,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1E2D4D',
    marginLeft: 4,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 32,
  },
  lockIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EEF3FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleSection: {
    alignItems: 'flex-start',
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E2D4D',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
  },
  cardsContainer: {
    gap: 14,
    marginBottom: 'auto',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F0F0F5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    gap: 14,
  },
  encryptionCard: {
    borderColor: '#FFF0D9',
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E2D4D',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
  },
  actionButton: {
    backgroundColor: BRIGHT_BLACK,
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
    shadowColor: BRIGHT_BLACK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  actionButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  /* Loader overlay */
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loaderContent: {
    alignItems: 'center',
  },
  spinnerRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#007AFF',
    borderTopColor: 'transparent',
    marginBottom: 32,
  },
  spinnerInner: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderRadius: 32,
  },
  loaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E2D4D',
    textAlign: 'center',
    marginBottom: 12,
  },
  loaderStep: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 28,
    minHeight: 20,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 40,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#007AFF',
  },
  loaderNote: {
    fontSize: 12,
    color: '#C7C7CC',
    textAlign: 'center',
  },
});

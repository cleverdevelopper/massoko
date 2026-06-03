import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  Animated,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import NumericKeypad from '@/components/NumericKeypad';
import axiosInstance from '@/utils/axiosInstance';
import { useAuth } from '@/context/AuthContext';

const BRIGHT_BLACK = '#000000';
const LINK_BLUE = '#00A8E8';
const SUCCESS_GREEN = '#34C759';
const ERROR_RED = '#FF3B30';
const OTP_LENGTH = 6;

type ValidationStatus = 'idle' | 'success' | 'error';

export default function OTPVerificationScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { phoneNumber, accountId } = useLocalSearchParams<{ phoneNumber: string, accountId: string }>();
  const [otp, setOtp] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('idle');
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  // Blinking cursor effect
  useEffect(() => {
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, {
          toValue: 0,
          duration: 530,
          useNativeDriver: true,
        }),
        Animated.timing(cursorOpacity, {
          toValue: 1,
          duration: 530,
          useNativeDriver: true,
        }),
      ])
    );
    blink.start();
    return () => blink.stop();
  }, []);

  // Timer logic
  useEffect(() => {
    if (timeLeft === 0) return;
    const intervalId = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(intervalId);
  }, [timeLeft]);

  const handleKeyPress = (digit: string) => {
    if (otp.length < OTP_LENGTH && !isValidating) {
      setValidationStatus('idle'); // Reset status on new input
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setOtp((prev) => prev + digit);
    }
  };

  const handleDelete = () => {
    if (!isValidating) {
      setValidationStatus('idle');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setOtp((prev) => prev.slice(0, -1));
    }
  };

  const handleVerify = async () => {
    if (otp.length !== OTP_LENGTH || isValidating) return;

    setIsValidating(true);
    setValidationStatus('idle');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const response = await axiosInstance.post('/api/v1/auth/verify-otp', {
        account_id: accountId,
        otp_code: otp,
      });

      const data = response.data;

      if (data.success) {
        setValidationStatus('success');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        setTimeout(async () => {
          if (data.etapa === 'COMPLETO' && data.tokens && data.user) {
            // User already registered, sign in and go home
            await signIn(data.tokens, data.user);
          } else {
            // New user, go to profile setup
            router.replace({
              pathname: '/auth/profile-setup',
              params: { accountId: accountId }
            });
          }
        }, 800);
      } else {
        // Handle specified errors: MISSING_PARAMS, ACCOUNT_NOT_FOUND, OTP_NOT_FOUND, INVALID_OTP, EXPIRED_OTP
        // All these should show the red error state as requested
        setValidationStatus('error');
        setIsValidating(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        
        // Optionally show the message from backend
        if (data.message) {
          // Alert.alert('Erro', data.message); // Commented out to match "just show red" behavior if preferred
          console.log('OTP Error:', data.error, data.message);
        }
      }
    } catch (error: any) {
      console.error('OTP Verification error:', error);
      setValidationStatus('error');
      setIsValidating(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      
      if (error.response?.data?.message) {
        console.log('OTP Error Response:', error.response.data);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const getSlotStyle = (index: number) => {
    const baseStyle: any[] = [styles.otpSlot];
    if (validationStatus === 'success') {
      baseStyle.push(styles.otpSlotSuccess);
    } else if (validationStatus === 'error') {
      baseStyle.push(styles.otpSlotError);
    }
    return baseStyle;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={28} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title}>Código de verificação</Text>
        <Text style={styles.subtitle}>
          Insira o código que enviamos para {phoneNumber || '+258 80 000 0000'}
        </Text>

        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.wrongNumber}>Número errado?</Text>
        </TouchableOpacity>

        {/* OTP Input - 3/3 Split */}
        <View style={styles.otpContainer}>
          <View style={styles.otpGroup}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={getSlotStyle(i)}>
                {otp.length > i ? (
                  <Text style={styles.otpText}>{otp[i]}</Text>
                ) : otp.length === i && !isValidating ? (
                  <Animated.View style={[styles.cursor, { opacity: cursorOpacity }]} />
                ) : (
                  <View style={styles.dash} />
                )}
              </View>
            ))}
          </View>
          
          <View style={styles.otpGap} />

          <View style={styles.otpGroup}>
            {[3, 4, 5].map((i) => (
              <View key={i} style={getSlotStyle(i)}>
                {otp.length > i ? (
                  <Text style={styles.otpText}>{otp[i]}</Text>
                ) : otp.length === i && !isValidating ? (
                  <Animated.View style={[styles.cursor, { opacity: cursorOpacity }]} />
                ) : (
                  <View style={styles.dash} />
                )}
              </View>
            ))}
          </View>
        </View>

        {/* Verify Button */}
        <TouchableOpacity
          style={[
            styles.verifyBtn,
            (otp.length !== OTP_LENGTH || isValidating) && styles.verifyBtnDisabled,
            validationStatus === 'success' && styles.verifyBtnSuccess,
            validationStatus === 'error' && styles.verifyBtnError,
          ]}
          onPress={handleVerify}
          disabled={otp.length !== OTP_LENGTH || isValidating}
          activeOpacity={0.8}
        >
          {isValidating && validationStatus === 'idle' ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#FFF" size="small" />
              <Text style={styles.verifyBtnText}>Verificando...</Text>
            </View>
          ) : (
            <Text style={styles.verifyBtnText}>
              {validationStatus === 'success' ? 'Verificado' : 'Verificar'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Footer / Timer Row */}
      <View style={styles.footerContainer}>
        <View style={styles.timerRow}>
          <TouchableOpacity 
            disabled={timeLeft > 0} 
            activeOpacity={0.7}
            style={styles.timerButton}
          >
            <Text style={[styles.timerText, timeLeft === 0 && styles.activeTimerText]}>
              {timeLeft > 0 ? `Reenviar código em ${formatTime(timeLeft)}` : 'Reenviar código'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            disabled={timeLeft > 0} 
            activeOpacity={0.7}
            style={styles.timerButton}
          >
            <Text style={[styles.timerText, timeLeft === 0 && styles.activeTimerText]}>
              {timeLeft > 0 ? `Fazer chamada em ${formatTime(timeLeft)}` : 'Fazer chamada'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Keypad */}
        <NumericKeypad onPress={handleKeyPress} onDelete={handleDelete} />
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
    paddingHorizontal: 8,
    height: 44,
    justifyContent: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    paddingTop: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 12,
  },
  wrongNumber: {
    fontSize: 16,
    color: LINK_BLUE,
    fontWeight: '700',
    marginBottom: 40,
  },
  otpContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
  },
  otpGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  otpGap: {
    width: 20,
  },
  otpSlot: {
    width: 46,
    height: 54,
    borderRadius: 12,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  otpSlotSuccess: {
    backgroundColor: '#E8FAEF',
    borderColor: SUCCESS_GREEN,
  },
  otpSlotError: {
    backgroundColor: '#FEECEC',
    borderColor: ERROR_RED,
  },
  otpText: {
    fontSize: 24,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  cursor: {
    width: 2,
    height: 24,
    backgroundColor: BRIGHT_BLACK,
    borderRadius: 1,
  },
  dash: {
    width: 10,
    height: 2,
    backgroundColor: '#8E8E93',
  },
  verifyBtn: {
    backgroundColor: BRIGHT_BLACK,
    width: '100%',
    height: 54,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifyBtnDisabled: {
    backgroundColor: '#E5E5EA',
  },
  verifyBtnSuccess: {
    backgroundColor: SUCCESS_GREEN,
  },
  verifyBtnError: {
    backgroundColor: ERROR_RED,
  },
  verifyBtnText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  footerContainer: {
    width: '100%',
  },
  timerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  timerButton: {
    flex: 1,
    alignItems: 'center',
  },
  timerText: {
    fontSize: 14,
    color: '#C6C6C8',
  },
  activeTimerText: {
    color: LINK_BLUE,
    fontWeight: '600',
  },
});

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  StatusBar,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COUNTRIES, Country } from '@/constants/countries';
import NumericKeypad from '@/components/NumericKeypad';
import PhoneIllustration from '@/components/PhoneIllustration';

const BRIGHT_BLUE = '#000000';

export default function PhoneRegistrationScreen() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country>(COUNTRIES[0]); // Mozambique
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isConfirmVisible, setIsConfirmVisible] = useState(false);
  const cursorOpacity = useRef(new Animated.Value(1)).current;

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

  const filteredCountries = useMemo(() => {
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.localName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.code.includes(searchQuery)
    );
  }, [searchQuery]);

  // Helper to count required digits in a pattern
  const getMaxDigits = (pattern: string) => pattern.replace(/[^0]/g, '').length;

  // Helper to format raw digits according to pattern
  const formatPhoneNumber = (digits: string, pattern: string) => {
    let result = '';
    let digitIndex = 0;
    for (let i = 0; i < pattern.length && digitIndex < digits.length; i++) {
      if (pattern[i] === '0') {
        result += digits[digitIndex];
        digitIndex++;
      } else {
        result += pattern[i];
      }
    }
    return result;
  };

  const handleKeyPress = (digit: string) => {
    const maxDigits = getMaxDigits(selectedCountry.pattern);
    if (phoneNumber.length < maxDigits) {
      setPhoneNumber((prev) => prev + digit);
    }
  };

  const handleDelete = () => {
    setPhoneNumber((prev) => prev.slice(0, -1));
  };

  const handleSelectCountry = (country: Country) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelectedCountry(country);
    setIsModalVisible(false);
    setSearchQuery('');
    setPhoneNumber(''); // Clear number when country changes to avoid format conflicts
  };

  const handleContinue = () => {
    const maxDigits = getMaxDigits(selectedCountry.pattern);
    if (phoneNumber.length === maxDigits) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsConfirmVisible(true);
    }
  };

  const handleConfirm = () => {
    setIsConfirmVisible(false);
    const formatted = formatPhoneNumber(phoneNumber, selectedCountry.pattern);
    router.push({
      pathname: '/auth/otp-verification',
      params: { phoneNumber: `${selectedCountry.code} ${formatted}` }
    });
  };

  const formattedValue = formatPhoneNumber(phoneNumber, selectedCountry.pattern);
  const isComplete = phoneNumber.length === getMaxDigits(selectedCountry.pattern);

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
        {/* Phone Illustration */}
        <View style={styles.illustrationWrap}>
          <PhoneIllustration />
        </View>

        <Text style={styles.title}>Seu número de telefone</Text>
        <Text style={styles.subtitle}>
          Insira seu número de telefone para começar.
        </Text>

        {/* Phone Input Row */}
        <View style={styles.phoneInputRow}>
          <TouchableOpacity
            style={styles.countryCodeBtn}
            onPress={() => setIsModalVisible(true)}
            activeOpacity={0.6}
          >
            <Text style={styles.countryCodeText}>{selectedCountry.code}</Text>
            <Ionicons name="chevron-down" size={14} color="#8E8E93" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
          <View style={styles.inputDivider} />
          <View style={styles.phoneNumberArea}>
            {!phoneNumber && <Animated.View style={[styles.cursor, { opacity: cursorOpacity }]} />}
            <Text style={[styles.phoneText, !phoneNumber && styles.phonePlaceholder]}>
              {phoneNumber ? formattedValue : selectedCountry.pattern}
            </Text>
            {!!phoneNumber && !isComplete && (
              <Animated.View style={[styles.cursor, { opacity: cursorOpacity }]} />
            )}
          </View>
        </View>

        {/* Verificar Button */}
        <TouchableOpacity
          style={[styles.verifyButton, !isComplete && styles.verifyButtonDisabled]}
          onPress={handleContinue}
          disabled={!isComplete}
          activeOpacity={0.8}
        >
          <Text style={[styles.verifyButtonText, !isComplete && styles.verifyTextDisabled]}>
            Verificar
          </Text>
        </TouchableOpacity>
      </View>

      {/* Spacer pushes keypad to bottom */}
      <View style={styles.spacer} />

      {/* Keypad — full width, outside padded content */}
      <NumericKeypad onPress={handleKeyPress} onDelete={handleDelete} />

      {/* Country Selection Modal */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Selecione o País</Text>
            <TouchableOpacity onPress={() => setIsModalVisible(false)} style={styles.modalCloseButton}>
              <Text style={styles.modalCloseText}>Fechar</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#8E8E93" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Pesquisar país ou código..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#8E8E93"
              clearButtonMode="while-editing"
            />
          </View>

          <FlatList
            data={filteredCountries}
            keyExtractor={(item) => item.code + item.name}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.countryItem}
                onPress={() => handleSelectCountry(item)}
                activeOpacity={0.6}
              >
                <View style={styles.countryItemLeft}>
                  <Text style={styles.countryItemFlag}>{item.flag}</Text>
                  <View style={styles.countryNameContainer}>
                    <Text style={styles.countryItemName}>{item.name}</Text>
                    {item.localName !== item.name && (
                      <Text style={styles.countryItemLocalName}>{item.localName}</Text>
                    )}
                  </View>
                </View>
                <Text style={styles.countryItemCode}>{item.code}</Text>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </SafeAreaView>
      </Modal>

      {/* Number Confirmation Modal */}
      <Modal
        visible={isConfirmVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsConfirmVisible(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>
              Confirmação do número: {selectedCountry.code} {phoneNumber}
            </Text>
            <Text style={styles.confirmMessage}>
              Um código de verificação será enviado para este número. O seu número de telefone acima está correto?
            </Text>
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleConfirm}
              activeOpacity={0.7}
            >
              <Text style={styles.confirmButtonText}>Sim</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, { marginBottom: 0 }]}
              onPress={() => setIsConfirmVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.confirmButtonText}>Editar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: 24,
  },
  illustrationWrap: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#6D6D72',
    lineHeight: 20,
    marginBottom: 28,
    textAlign: 'center',
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFEFF4',
    borderRadius: 10,
    height: 50,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  countryCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
  },
  countryCodeText: {
    fontSize: 17,
    fontWeight: '500',
    color: '#000',
  },
  inputDivider: {
    width: 1,
    height: 26,
    backgroundColor: '#C7C7CC',
    marginRight: 14,
  },
  phoneNumberArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cursor: {
    width: 2,
    height: 22,
    backgroundColor: BRIGHT_BLUE,
    marginLeft: 2,
    borderRadius: 1,
  },
  phoneText: {
    fontSize: 17,
    color: '#000',
  },
  phonePlaceholder: {
    color: '#8E8E93',
  },
  verifyButton: {
    backgroundColor: BRIGHT_BLUE,
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12, // Standardized
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BRIGHT_BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  verifyButtonDisabled: {
    backgroundColor: '#E5E5EA',
    shadowOpacity: 0,
    elevation: 0,
  },
  verifyButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  verifyTextDisabled: {
    color: '#8E8E93',
  },
  spacer: {
    flex: 1,
  },
  // ── Modal Styles ──
  modalContainer: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 0.5,
    borderBottomColor: '#C6C6C8',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  modalCloseButton: {
    position: 'absolute',
    right: 16,
  },
  modalCloseText: {
    fontSize: 17,
    color: BRIGHT_BLUE,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5E5EA',
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    color: '#000',
    fontWeight: '400',
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
  },
  countryItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  countryItemFlag: {
    fontSize: 32,
    marginRight: 16,
  },
  countryNameContainer: {
    flex: 1,
  },
  countryItemName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  countryItemLocalName: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  countryItemCode: {
    fontSize: 17,
    color: '#8E8E93',
    fontWeight: '500',
  },
  separator: {
    height: 0.5,
    backgroundColor: '#C6C6C8',
    marginLeft: 68,
  },
  // ── Confirmation Modal Styles ──
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  confirmCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  confirmTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  confirmMessage: {
    fontSize: 15,
    color: '#3C3C43',
    lineHeight: 21,
    marginBottom: 24,
  },
  confirmButton: {
    backgroundColor: '#EFEFF0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  confirmButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
});

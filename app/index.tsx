import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Dimensions,
  TouchableOpacity,
  SafeAreaView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const { width } = Dimensions.get('window');

const MASSOKO_PURPLE = '#7B2CBF';
const MASSOKO_BLUE = '#000000';

interface Slide {
  id: string;
  title: string;
  description: string;
  image?: any;
}
// ... (SLIDES remain the same)
const SLIDES: Slide[] = [
  {
    id: '1',
    title: 'Massoko',
    description: 'O mensageiro mais ágil e privado que você já experimentou. Seguro por definição.',
    image: require('../assets/onboarding/massoko_logo.png'),
  },
  {
    id: '2',
    title: 'Veloz',
    description: 'O Massoko entrega suas mensagens instantaneamente, rompendo qualquer limite de tempo.',
    image: require('../assets/onboarding/onboarding_fast.png'),
  },
  {
    id: '3',
    title: 'Livre',
    description: 'Sem assinaturas ou anúncios. O Massoko foi feito para ser livre e acessível a todos.',
    image: require('../assets/onboarding/onboarding_free.png'),
  },
  {
    id: '4',
    title: 'Ilimitado',
    description: 'Compartilhe fotos, vídeos e arquivos de qualquer tamanho, sem restrições ou perdas.',
    image: require('../assets/onboarding/onboarding_powerful.png'),
  },
  {
    id: '5',
    title: 'Protegido',
    description: 'Sua privacidade em primeiro lugar. O Massoko blinda suas conversas contra qualquer ameaça.',
    image: require('../assets/onboarding/onboarding_secure.png'),
  },
];

export default function OnboardingScreen() {
  const [activeSlide, setActiveSlide] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const contentOffset = e.nativeEvent.contentOffset.x;
    const viewSize = e.nativeEvent.layoutMeasurement.width;
    const index = Math.round(contentOffset / viewSize);
    setActiveSlide(index);
  };

  const handleStartMessaging = () => {
    router.push('/auth/phone-registration');
  };

  const renderSlide = ({ item }: { item: Slide }) => (
    <View style={styles.slide}>
      <View style={styles.imageContainer}>
        <View style={styles.logoWrapper}>
          <Image
            source={item.image}
            style={styles.image}
            contentFit="contain"
          />
        </View>
      </View>
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color: theme.text }]}>{item.title}</Text>
        <Text style={[styles.description, { color: theme.icon }]}>{item.description}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        keyExtractor={(item) => item.id}
      />

      <View style={styles.footer}>
        <View style={styles.pagination}>
          {SLIDES.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                { backgroundColor: activeSlide === index ? MASSOKO_BLUE : '#D1D1D1' },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={handleStartMessaging}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Começar a conversar</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  slide: {
    width: width,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  imageContainer: {
    width: width * 0.6,
    height: width * 0.6,
    marginBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrapper: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '80%',
    height: '80%',
  },
  textContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: 40,
    paddingBottom: 40,
    alignItems: 'center',
  },
  pagination: {
    flexDirection: 'row',
    marginBottom: 30,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  button: {
    backgroundColor: '#000000',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

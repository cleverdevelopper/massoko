import React, { useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const CONTAINER_HEIGHT = 76;
const PADDING = 6;
const ACTIVE_CAPSULE_HEIGHT = CONTAINER_HEIGHT - PADDING * 2;

// Maps route names to their display text, active icon, and inactive icon
const TAB_CONFIG: Record<
  string,
  { label: string; activeIcon: keyof typeof Ionicons.glyphMap; inactiveIcon: keyof typeof Ionicons.glyphMap }
> = {
  index: {
    label: 'Chats',
    activeIcon: 'chatbubble',
    inactiveIcon: 'chatbubble-outline',
  },
  calls: {
    label: 'Calls',
    activeIcon: 'call',
    inactiveIcon: 'call-outline',
  },
  stories: {
    label: 'Stories',
    activeIcon: 'albums',
    inactiveIcon: 'albums-outline',
  },
  profile: {
    label: 'Perfil',
    activeIcon: 'person',
    inactiveIcon: 'person-outline',
  },
};

export function FloatingSegmentedTabs({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Filter routes to include index, calls, stories, and profile
  const visibleRoutes = state.routes.filter(
    (route) => TAB_CONFIG[route.name] !== undefined
  );

  const activeRouteName = state.routes[state.index]?.name;
  const activeIndex = visibleRoutes.findIndex(
    (route) => route.name === activeRouteName
  );
  const safeActiveIndex = activeIndex >= 0 ? activeIndex : 0;

  // Responsive container width: 92% of screen width, max 380px
  const containerWidth = Math.min(screenWidth * 0.92, 380);
  const tabWidth = (containerWidth - PADDING * 2) / 4;

  const translateX = useSharedValue(0);

  useEffect(() => {
    translateX.value = withSpring(safeActiveIndex * tabWidth, {
      damping: 18,
      stiffness: 150,
      mass: 1.0,
    });
  }, [safeActiveIndex, tabWidth, translateX]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  const handlePress = (routeName: string, isFocused: boolean) => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    const event = navigation.emit({
      type: 'tabPress',
      target: routeName,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  };

  return (
    <View
      style={[
        styles.absoluteContainer,
        {
          bottom: Math.max(insets.bottom, 16),
          width: containerWidth,
        },
      ]}
    >
      <View style={styles.floatingContainer}>
        {/* Active Sliding Background Capsule enclosing both icon and text */}
        <Animated.View
          style={[
            styles.activeIndicator,
            {
              width: tabWidth,
              left: PADDING,
            },
            animatedStyle,
          ]}
        />

        {/* Tab Items */}
        {visibleRoutes.map((route, index) => {
          const config = TAB_CONFIG[route.name];
          if (!config) return null;

          const isFocused = safeActiveIndex === index;

          return (
            <TouchableOpacity
              key={route.key}
              activeOpacity={0.8}
              onPress={() => handlePress(route.name, isFocused)}
              style={[
                styles.tabItem,
                {
                  width: tabWidth,
                },
              ]}
            >
              <Ionicons
                name={isFocused ? config.activeIcon : config.inactiveIcon}
                size={22}
                color={isFocused ? '#000000' : 'rgba(0, 0, 0, 0.6)'}
              />
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isFocused ? '#000000' : 'rgba(0, 0, 0, 0.5)',
                    fontWeight: isFocused ? '600' : '500',
                  },
                ]}
              >
                {config.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  absoluteContainer: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 999,
  },
  floatingContainer: {
    height: CONTAINER_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderRadius: CONTAINER_HEIGHT / 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PADDING,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  activeIndicator: {
    position: 'absolute',
    height: ACTIVE_CAPSULE_HEIGHT,
    backgroundColor: '#EAEAEA', // Capsule background enclosing entire item (icon + text)
    borderRadius: ACTIVE_CAPSULE_HEIGHT / 2,
  },
  tabItem: {
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  tabLabel: {
    fontSize: 12,
    marginTop: 4,
  },
});

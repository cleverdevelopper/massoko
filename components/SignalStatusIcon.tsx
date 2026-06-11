import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SignalStatusIconProps {
  status: 'sent' | 'delivered' | 'read' | null;
  size?: number;
  style?: ViewStyle;
  isList?: boolean;
}

export function SignalStatusIcon({ status, size = 16, style, isList = false }: SignalStatusIconProps) {
  if (!status) return null;

  const isSent = status === 'sent';

  // Determine colors based on whether it is in the chat bubble or list screen
  let circleBg: string;
  let iconColor: string;

  if (isList) {
    // List screen (white background)
    // Circle background: semi-transparent grey/black
    circleBg = 'rgba(0, 0, 0, 0.35)';
    iconColor = '#FFFFFF';
  } else {
    // Chat bubble (blue background)
    // Circle background: semi-transparent white
    circleBg = 'rgba(255, 255, 255, 0.25)';
    iconColor = '#FFFFFF';
  }

  const iconName = isSent ? 'checkmark' : 'checkmark-done';

  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: circleBg,
        },
        style,
      ]}
    >
      <Ionicons
        name={iconName}
        size={size * 0.65}
        color={iconColor}
        style={{ marginTop: 0.5 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

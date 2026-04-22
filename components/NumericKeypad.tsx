import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');
const KEY_WIDTH = Math.floor((width - 28) / 3);
const KEY_HEIGHT = 48;

interface NumericKeypadProps {
  onPress: (digit: string) => void;
  onDelete: () => void;
}

const KEY_LETTERS: Record<string, string> = {
  '1': '',
  '2': 'ABC',
  '3': 'DEF',
  '4': 'GHI',
  '5': 'JKL',
  '6': 'MNO',
  '7': 'PQRS',
  '8': 'TUV',
  '9': 'WXYZ',
  '0': '+',
};

export default function NumericKeypad({ onPress, onDelete }: NumericKeypadProps) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'symbols', '0', 'delete'];

  const handlePress = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(key);
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDelete();
  };

  const renderKey = (key: string, index: number) => {
    if (key === 'symbols') {
      return <View key={index} style={[styles.key, styles.emptyKey]} />;
    }

    if (key === 'delete') {
      return (
        <TouchableOpacity
          key={index}
          style={[styles.key, styles.deleteKey]}
          onPress={handleDelete}
          activeOpacity={0.4}
        >
          <Ionicons name="backspace-outline" size={28} color="#000" />
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        key={index}
        style={styles.key}
        onPress={() => handlePress(key)}
        activeOpacity={0.5}
      >
        <Text style={styles.keyDigit}>{key}</Text>
        {KEY_LETTERS[key] ? <Text style={styles.keyLetters}>{KEY_LETTERS[key]}</Text> : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {keys.map((key, index) => renderKey(key, index))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#E2E2E7', // Lighter, less heavy gray
    paddingHorizontal: 8,
    paddingTop: 12, // Increased top padding
    paddingBottom: 40,
    borderTopLeftRadius: 24, // Rounded top corners
    borderTopRightRadius: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  key: {
    width: KEY_WIDTH,
    height: KEY_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
    backgroundColor: '#FCFCFE',
    borderRadius: 8, // Slightly more rounded keys
    shadowColor: '#898A8D',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 0,
    elevation: 1,
  },
  emptyKey: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  deleteKey: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  keyDigit: {
    fontSize: 26,
    fontWeight: '400',
    color: '#000',
  },
  keyLetters: {
    fontSize: 10,
    fontWeight: '600',
    color: '#000',
    marginTop: -2,
    letterSpacing: 1.5,
  },
});

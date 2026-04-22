import React from 'react';
import { View, StyleSheet } from 'react-native';

const CIRCLE_SIZE = 120;
const PHONE_W = 46;
const PHONE_H = 76;
const SCREEN_BLUE = '#3B8AFF';
const BODY_COLOR = '#1E2D4D';

export default function PhoneIllustration() {
  return (
    <View style={styles.outerCircle}>
      {/* Subtle shadow behind phone */}
      <View style={styles.phoneShadow} />

      {/* Phone body */}
      <View style={styles.phoneBody}>
        {/* Top bezel — notch / ear speaker */}
        <View style={styles.topBezel}>
          <View style={styles.earSpeaker} />
        </View>

        {/* Screen */}
        <View style={styles.screen}>
          {/* Mini status bar */}
          <View style={styles.statusBar}>
            <View style={styles.statusDot} />
            <View style={styles.statusDot} />
            <View style={styles.statusDot} />
          </View>

          {/* Decorative chat-like lines */}
          <View style={styles.screenContent}>
            <View style={[styles.chatLine, { width: '70%' }]} />
            <View style={[styles.chatLine, styles.chatLineRight, { width: '55%' }]} />
            <View style={[styles.chatLine, { width: '60%' }]} />
          </View>

          {/* Bright blue glow overlay */}
          <View style={styles.screenGlow} />
        </View>

        {/* Bottom chin — home indicator */}
        <View style={styles.bottomBezel}>
          <View style={styles.homeIndicator} />
        </View>
      </View>

      {/* Small signal ring at top-right */}
      <View style={styles.signalRing}>
        <View style={styles.signalInner} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    backgroundColor: '#F0F1F5',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  phoneShadow: {
    position: 'absolute',
    width: PHONE_W - 4,
    height: PHONE_H - 4,
    borderRadius: 9,
    backgroundColor: 'rgba(30, 45, 77, 0.2)',
    top: (CIRCLE_SIZE - PHONE_H) / 2 + 4,
    left: (CIRCLE_SIZE - PHONE_W) / 2 + 3,
  },
  phoneBody: {
    width: PHONE_W,
    height: PHONE_H,
    borderRadius: 10,
    backgroundColor: BODY_COLOR,
    overflow: 'hidden',
    // 3D depth shadow
    shadowColor: '#1E2D4D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  topBezel: {
    height: 8,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 1,
  },
  earSpeaker: {
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#2A3D62',
  },
  screen: {
    flex: 1,
    marginHorizontal: 3,
    marginTop: 1,
    marginBottom: 1,
    borderRadius: 4,
    backgroundColor: SCREEN_BLUE,
    overflow: 'hidden',
    position: 'relative',
  },
  statusBar: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    paddingTop: 3,
    gap: 2,
  },
  statusDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  screenContent: {
    flex: 1,
    paddingHorizontal: 4,
    paddingTop: 6,
    gap: 4,
  },
  chatLine: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  chatLineRight: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  screenGlow: {
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: 20,
    backgroundColor: 'transparent',
    // subtle inner glow
    borderWidth: 8,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  bottomBezel: {
    height: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeIndicator: {
    width: 16,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: '#2A3D62',
  },
  // Small decorative signal ring (top-right of circle)
  signalRing: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: SCREEN_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: SCREEN_BLUE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  signalInner: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FFFFFF',
  },
});

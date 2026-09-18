import React from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { useToastStore } from '@/stores/toastStore';

const toneConfig = {
  success: { icon: 'checkmark-circle', bg: '#14532d' },
  error: { icon: 'alert-circle', bg: '#7f1d1d' },
  warning: { icon: 'warning', bg: '#92400e' },
  info: { icon: 'information-circle', bg: colors.ink },
} as const;

export const ToastHost: React.FC = () => {
  const { message, tone, counter, hide } = useToastStore();
  const insets = useSafeAreaInsets();
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(-20)).current;

  React.useEffect(() => {
    if (!message) return;
    opacity.setValue(0);
    translateY.setValue(-20);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -20, duration: 180, useNativeDriver: true }),
      ]).start(() => hide());
    }, tone === 'error' ? 5600 : 3200);
    return () => clearTimeout(timer);
  }, [message, counter, hide, opacity, translateY, tone]);

  if (!message) return null;
  const config = toneConfig[tone] ?? toneConfig.info;

  return (
    <View
      style={[styles.overlay, { paddingTop: insets.top + 10 }]}
      pointerEvents="box-none"
    >
      <Animated.View
        style={[
          styles.toast,
          shadows.raised,
          {
            backgroundColor: config.bg,
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <Ionicons name={config.icon as any} size={20} color="#fff" />
        <Text style={styles.text} numberOfLines={5}>
          {message}
        </Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99999,
    elevation: Platform.OS === 'android' ? 99999 : 0,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    width: '100%',
    maxWidth: 520,
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});

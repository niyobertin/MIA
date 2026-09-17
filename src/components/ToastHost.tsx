import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
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
  const translateY = React.useRef(new Animated.Value(16)).current;

  React.useEffect(() => {
    if (!message) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 16, duration: 200, useNativeDriver: true }),
      ]).start(() => hide());
    }, 3200);
    return () => clearTimeout(timer);
  }, [message, counter]);

  if (!message) return null;
  const config = toneConfig[tone];

  return (
    <View style={[styles.container, { bottom: insets.bottom + 96 }]} pointerEvents="none">
      <Animated.View style={[styles.toast, { backgroundColor: config.bg, opacity, transform: [{ translateY }] }, shadows.raised]}>
        <Ionicons name={config.icon as any} size={20} color="#fff" />
        <Text style={styles.text} numberOfLines={2}>{message}</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
    zIndex: 999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    maxWidth: '100%',
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});

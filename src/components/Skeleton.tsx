import React from 'react';
import { View, StyleSheet, Animated, ViewStyle } from 'react-native';
import { colors, radius } from '@/theme/tokens';

function usePulse(): Animated.Value {
  const opacity = React.useRef(new Animated.Value(0.4)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return opacity;
}

export const Skeleton: React.FC<{ width?: number | string; height?: number; style?: ViewStyle }> = ({
  width = '100%',
  height = 16,
  style,
}) => {
  const opacity = usePulse();
  return <Animated.View style={[{ width: width as any, height, opacity }, styles.block, style]} />;
};

export const SkeletonCard: React.FC = () => {
  const opacity = usePulse();
  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={styles.line} />
      <View style={[styles.line, styles.short]} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.border,
    borderRadius: radius.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  line: {
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.border,
    marginBottom: 8,
  },
  short: {
    width: '55%',
    marginBottom: 0,
  },
});

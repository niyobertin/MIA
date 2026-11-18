import React from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { APP_NAME } from '@/constants';
import { colors } from '@/theme/tokens';
import { Logo } from './Logo';

const LOGO_SIZE = 168;

export const SplashScreen: React.FC = () => {
  const { t } = useTranslation();
  const enter = React.useRef(new Animated.Value(0)).current;
  const pulse = React.useRef(new Animated.Value(0)).current;
  const halo = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    let loops: Animated.CompositeAnimation | null = null;
    let cancelled = false;

    Animated.timing(enter, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduceMotion) => {
        if (cancelled || reduceMotion) return;
        loops = Animated.parallel([
          Animated.loop(
            Animated.sequence([
              Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
              Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ])
          ),
          Animated.loop(
            Animated.timing(halo, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true })
          ),
        ]);
        loops.start();
      });

    return () => {
      cancelled = true;
      loops?.stop();
    };
  }, [enter, pulse, halo]);

  const logoScale = Animated.multiply(
    enter.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
    pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] })
  );
  const haloScale = halo.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.5] });
  const haloOpacity = halo.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.35, 0] });
  const textOpacity = enter;
  const textShift = enter.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });

  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel={t('common.loading')}>
      <View style={styles.logoArea}>
        <Animated.View
          style={[styles.halo,{ opacity: haloOpacity, transform: [{ scale: haloScale }] }]}
        />
        <Animated.View style={{ opacity: enter, transform: [{ scale: logoScale }] }}>
          <Logo size={LOGO_SIZE} />
        </Animated.View>
      </View>
      <Animated.Text style={[styles.title, { opacity: textOpacity, transform: [{ translateY: textShift }] }]}>
        {APP_NAME}
      </Animated.Text>
      <Animated.Text style={[styles.subtitle, { opacity: textOpacity, transform: [{ translateY: textShift }] }]}>
        {t('common.appDescription')}
      </Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoArea: {
    width: LOGO_SIZE * 1.5,
    height: LOGO_SIZE * 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  halo: {
    position: 'absolute',
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    backgroundColor: colors.primary,
    pointerEvents: 'none',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#062653',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'center',
  },
});

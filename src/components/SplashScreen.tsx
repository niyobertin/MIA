import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Animated, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { APP_NAME } from '@/constants';
import { useTranslation } from 'react-i18next';
import { Logo } from './Logo';

export const SplashScreen: React.FC = () => {
  const { t } = useTranslation();
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const scaleAnim = React.useRef(new Animated.Value(0.8)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.logoContainer,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Logo size={192} style={{ marginBottom: 16 }} />
        <Animated.Text
          style={[
            styles.title,
            { opacity: fadeAnim },
          ]}
        >
          {APP_NAME}
        </Animated.Text>
        <Animated.Text
          style={[
            styles.subtitle,
            { opacity: fadeAnim },
          ]}
        >
          {t('common.appDescription')}
        </Animated.Text>
      </Animated.View>
      
      <Animated.View
        style={[
          styles.loadingContainer,
          { opacity: fadeAnim },
        ]}
      >
        <ActivityIndicator size="large" color="#0ea5e9" />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
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
  },
  loadingContainer: {
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
  },
});

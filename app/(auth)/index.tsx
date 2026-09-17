import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/Button';
import { useTranslation } from 'react-i18next';
import { APP_NAME } from '@/constants';
import { FormScrollView } from '@/components';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WelcomeScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container}>
      <FormScrollView>
        <View style={styles.logoContainer}>
          <Text style={styles.title}>{APP_NAME}</Text>
          <Text style={styles.subtitle}>{t('auth.welcome')}</Text>
          <Text style={styles.tagline}>{t('auth.welcomeTagline')}</Text>
        </View>

        <View style={styles.actionsContainer}>
          <Link href="/(auth)/register" asChild>
            <Button variant="primary" size="lg" fullWidth>
              <Ionicons name="person-add" size={22} style={styles.buttonIcon} />
              <Text style={styles.buttonText}>{t('auth.createAccount')}</Text>
            </Button>
          </Link>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('auth.hasAccount')}</Text>
            <View style={styles.dividerLine} />
          </View>

          <Link href="/(auth)/login" asChild>
            <Button variant="outline" size="lg" fullWidth>
              <Ionicons name="log-in" size={22} style={styles.buttonIcon} />
              <Text style={styles.buttonText}>{t('auth.signIn')}</Text>
            </Button>
          </Link>
        </View>
      </FormScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  logoContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 32,
  },
  title: {
    fontSize: 40,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  tagline: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 22,
  },
  actionsContainer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 16,
  },
  buttonIcon: {
    marginRight: 10,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  dividerText: {
    fontSize: 14,
    color: '#9ca3af',
  },
});

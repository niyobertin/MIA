import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Logo, FormScrollView, ConfirmModal } from '@/components';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';

export default function OnboardingWelcomeScreen() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    logout();
    router.replace('/(auth)');
  };

  return (
    <SafeAreaView style={styles.container}>
      <FormScrollView>
        <View style={styles.content}>
          <Logo size={136} style={styles.logo} />
          <Text style={styles.title}>{t('auth.setupBusiness')}</Text>
          <Text style={styles.subtitle}>
            {t('auth.setupBusinessDescription', { name: user?.name ?? '' })}
          </Text>

          <View style={styles.actions}>
            <Link href="/(onboarding)/create-business" asChild>
              <Button variant="primary" size="lg" fullWidth>
                <Ionicons name="storefront" size={22} style={styles.buttonIcon} />
                <Text style={styles.buttonText}>{t('auth.createBusiness')}</Text>
              </Button>
            </Link>

            <Link href="/(onboarding)/join-business" asChild>
              <Button variant="outline" size="lg" fullWidth>
                <Ionicons name="people" size={22} style={styles.buttonIcon} />
                <Text style={styles.buttonText}>{t('auth.joinBusiness')}</Text>
              </Button>
            </Link>

            <Button variant="ghost" size="md" fullWidth onPress={() => setShowLogoutConfirm(true)}>
              {t('auth.signOut')}
            </Button>
          </View>
        </View>
      </FormScrollView>

      <ConfirmModal
        visible={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
        title={t('common.logoutConfirmTitle')}
        message={t('common.logoutConfirmMessage')}
        confirmText={t('common.logout')}
        variant="danger"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    justifyContent: 'center',
  },
  logo: {
    alignSelf: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  actions: {
    gap: 16,
  },
  buttonIcon: {
    marginRight: 10,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

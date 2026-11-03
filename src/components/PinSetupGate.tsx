import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { colors } from '@/theme/tokens';
import { ChangePinForm } from './ChangePinForm';
import { FormScrollView } from './FormScrollView';

export function PinSetupGate() {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const pinSetupRequired = useAuthStore((s) => s.pinSetupRequired);
  const pendingLegacySecret = useAuthStore((s) => s.pendingLegacySecret);
  const logout = useAuthStore((s) => s.logout);

  const visible = isAuthenticated && pinSetupRequired;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => undefined}>
      <SafeAreaView style={styles.container}>
        <FormScrollView contentContainerStyle={styles.content}>
          <View style={styles.iconWrap}>
            <Ionicons name="keypad" size={28} color={colors.primary} />
          </View>
          <Text style={styles.title}>{t('auth.setPinTitle')}</Text>
          <Text style={styles.subtitle}>{t('auth.setPinRequired')}</Text>
          <ChangePinForm askCurrent={!pendingLegacySecret} currentIsPassword />
          <TouchableOpacity onPress={logout} style={styles.signOut} accessibilityRole="button">
            <Text style={styles.signOutText}>{t('auth.signOut')}</Text>
          </TouchableOpacity>
        </FormScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.card,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 48,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.muted,
    marginBottom: 24,
  },
  signOut: {
    alignSelf: 'center',
    marginTop: 20,
    padding: 8,
  },
  signOutText: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '600',
  },
});

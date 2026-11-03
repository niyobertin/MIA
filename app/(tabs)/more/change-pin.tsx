import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FormScrollView } from '@/components';
import { ChangePinForm } from '@/components/ChangePinForm';
import { colors, radius } from '@/theme/tokens';

export default function ChangePinScreen() {
  const { t } = useTranslation();

  return (
    <FormScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="keypad" size={24} color={colors.primary} />
        </View>
        <Text style={styles.description}>{t('auth.changePinDescription')}</Text>
        <ChangePinForm askCurrent onDone={() => router.back()} />
      </View>
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 20,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    marginBottom: 20,
  },
});

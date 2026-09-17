import React from 'react';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '@/theme/tokens';

export default function MoreLayout() {
  const { t } = useTranslation();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.primary,
        headerTitleStyle: { fontWeight: '700', color: colors.ink },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="business-settings" options={{ title: t('settings.businessSettings') }} />
      <Stack.Screen name="user-management" options={{ title: t('settings.userManagement') }} />
      <Stack.Screen name="language" options={{ title: t('settings.language') }} />
      <Stack.Screen name="sync" options={{ title: t('settings.syncStatus') }} />
      <Stack.Screen name="about" options={{ title: t('settings.about') }} />
      <Stack.Screen name="help" options={{ title: t('settings.help') }} />
    </Stack>
  );
}

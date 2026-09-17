import React from 'react';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function OnboardingLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#fff' },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('auth.setupBusiness') }} />
      <Stack.Screen name="create-business" options={{ title: t('auth.createBusiness') }} />
      <Stack.Screen name="join-business" options={{ title: t('auth.joinBusiness') }} />
    </Stack>
  );
}

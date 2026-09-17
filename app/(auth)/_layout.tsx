import React from 'react';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function AuthLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#fff' },
      }}
    >
      <Stack.Screen name="index" options={{ title: t('auth.welcome') }} />
      <Stack.Screen name="login" options={{ title: t('auth.signIn') }} />
      <Stack.Screen name="register" options={{ title: t('auth.createAccount') }} />
      <Stack.Screen name="create-business" options={{ title: t('auth.createBusiness') }} />
    </Stack>
  );
}

import React from 'react';
import { Stack } from 'expo-router';
import { Providers } from '@/components/Providers';
import { useAuthStore } from '@/stores/authStore';
import { SplashScreen } from '@/components/SplashScreen';
import '@/i18n';

export default function RootLayout() {
  const { isAuthenticated, isLoading, hasHydrated, loadSession } = useAuthStore();

  React.useEffect(() => {
    loadSession();
  }, [loadSession]);

  if (!hasHydrated || isLoading) {
    return <SplashScreen />;
  }

  return (
    <Providers>
      <Stack screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <Stack.Screen name="(tabs)" />
        ) : (
          <Stack.Screen name="(auth)" />
        )}
      </Stack>
    </Providers>
  );
}
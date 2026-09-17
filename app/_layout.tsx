import React from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { Providers } from '@/components/Providers';
import { useAuthStore } from '@/stores/authStore';
import { SplashScreen } from '@/components/SplashScreen';
import '@/i18n';

function RootNavigator() {
  const router = useRouter();
  const segments = useSegments();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const business = useAuthStore((s) => s.business);
  const isLoading = useAuthStore((s) => s.isLoading);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const loadSession = useAuthStore((s) => s.loadSession);

  React.useEffect(() => {
    void loadSession();
  }, [loadSession]);

  React.useEffect(() => {
    if (!hasHydrated || isLoading) return;

    const root = segments[0];
    const inAuth = root === '(auth)';
    const inOnboarding = root === '(onboarding)';
    const inTabs = root === '(tabs)';
    const hasBusiness = isAuthenticated && !!business;

    if (!isAuthenticated) {
      if (!inAuth) {
        router.replace('/(auth)');
      }
      return;
    }

    if (!hasBusiness) {
      if (!inOnboarding) {
        router.replace('/(onboarding)');
      }
      return;
    }

    if (!inTabs) {
      router.replace('/(tabs)');
    }
  }, [hasHydrated, isLoading, isAuthenticated, business, segments, router]);

  if (!hasHydrated || isLoading) {
    return <SplashScreen />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <Providers>
      <RootNavigator />
    </Providers>
  );
}

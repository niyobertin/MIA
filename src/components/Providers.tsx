'use client';

import React from 'react';
import { Platform, StatusBar as RNStatusBar } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { colors } from '@/theme/tokens';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useSyncStore } from '@/stores/syncStore';
import { getSyncEngine } from '@/services/sync/syncEngine';
import { refreshPendingCount } from '@/services/sync/queue';
import { ToastHost } from './ToastHost';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function useBrandStatusBar() {
  React.useEffect(() => {
    RNStatusBar.setBarStyle('dark-content', true);
    if (Platform.OS === 'android') {
      RNStatusBar.setBackgroundColor(colors.background, true);
      RNStatusBar.setTranslucent(false);
    }
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  useBrandStatusBar();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
    <SafeAreaProvider>
      <StatusBar style="dark" backgroundColor={colors.background} translucent={false} />
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ZustandProviders>
            {children}
          </ZustandProviders>
          <ToastHost />
        </I18nextProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ZustandProviders({ children }: { children: React.ReactNode }) {
  const authStore = useAuthStore();
  const uiStore = useUIStore();
  const syncStore = useSyncStore();
  const language = useUIStore((s) => s.language);
  const businessId = useAuthStore((s) => s.business?.id);

  React.useEffect(() => {
    if (language && i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language]);

  React.useEffect(() => {
    if (!businessId) return;

    const engine = getSyncEngine('local-device');
    const unsub = engine.subscribe((status) => {
      useSyncStore.getState().setStatus(status);
      useSyncStore.getState().setPendingCount(status.pendingCount);
      if (status.lastSyncAt) {
        useSyncStore.getState().setLastSyncAt(status.lastSyncAt);
      }
    });

    void refreshPendingCount(businessId);
    void engine.startAutoSync(30000);

    return () => {
      unsub();
      engine.stopAutoSync();
    };
  }, [businessId]);

  return (
    <AuthProvider store={authStore}>
      <UIProvider store={uiStore}>
        <SyncProvider store={syncStore}>
          {children}
        </SyncProvider>
      </UIProvider>
    </AuthProvider>
  );
}

function AuthProvider({ store, children }: { store: ReturnType<typeof useAuthStore>; children: React.ReactNode }) {
  return <AuthContext.Provider value={store}>{children}</AuthContext.Provider>;
}

function UIProvider({ store, children }: { store: ReturnType<typeof useUIStore>; children: React.ReactNode }) {
  return <UIContext.Provider value={store}>{children}</UIContext.Provider>;
}

function SyncProvider({ store, children }: { store: ReturnType<typeof useSyncStore>; children: React.ReactNode }) {
  return <SyncContext.Provider value={store}>{children}</SyncContext.Provider>;
}

const AuthContext = React.createContext<ReturnType<typeof useAuthStore> | null>(null);
const UIContext = React.createContext<ReturnType<typeof useUIStore> | null>(null);
const SyncContext = React.createContext<ReturnType<typeof useSyncStore> | null>(null);

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const useUI = () => {
  const context = React.useContext(UIContext);
  if (!context) throw new Error('useUI must be used within UIProvider');
  return context;
};

export const useSync = () => {
  const context = React.useContext(SyncContext);
  if (!context) throw new Error('useSync must be used within SyncProvider');
  return context;
};

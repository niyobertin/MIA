import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Slot } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Providers } from '@/components/Providers';
import '@/i18n';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Providers>
          <Slot />
          <StatusBar style="dark" backgroundColor="#f1f5f9" />
        </Providers>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

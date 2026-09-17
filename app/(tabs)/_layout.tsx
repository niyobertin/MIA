import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme/tokens';
import { OfflineBanner } from '@/components/OfflineBanner';

export default function TabsLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);
  const tabBarStyle = StyleSheet.flatten([
    styles.tabBar,
    {
      height: 68 + bottomPad,
      paddingBottom: bottomPad,
    },
  ]);

  return (
    <View style={styles.root}>
      <OfflineBanner />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.faint,
          tabBarStyle,
          tabBarLabelStyle: styles.tabBarLabel,
          tabBarIconStyle: styles.tabBarIcon,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('navigation.home'),
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="stock"
          options={{
            title: t('navigation.stock'),
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? 'cube' : 'cube-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="sale"
          options={{
            title: t('navigation.sale'),
            tabBarLabel: t('navigation.newSale'),
            tabBarIcon: ({ focused }) => (
              <View
                style={StyleSheet.flatten([
                  styles.saleButton,
                  focused ? styles.saleButtonFocused : null,
                ])}
              >
                <Ionicons name="cart" size={28} color={colors.white} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="reports"
          options={{
            title: t('navigation.reports'),
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: t('navigation.more'),
            tabBarIcon: ({ focused, color }) => (
              <Ionicons name={focused ? 'menu' : 'menu-outline'} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen name="closing" options={{ href: null }} />
        <Tabs.Screen name="expense" options={{ href: null }} />
        <Tabs.Screen name="stock-in" options={{ href: null }} />
        <Tabs.Screen name="payment" options={{ href: null }} />
        <Tabs.Screen name="stock/[id]" options={{ href: null }} />
        <Tabs.Screen name="customers" options={{ href: null }} />
        <Tabs.Screen name="suppliers" options={{ href: null }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  tabBar: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  tabBarLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  tabBarIcon: {
    marginBottom: 0,
  },
  saleButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
    borderWidth: 4,
    borderColor: colors.card,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  saleButtonFocused: {
    backgroundColor: colors.primaryDark,
    transform: [{ scale: 1.04 }],
  },
});

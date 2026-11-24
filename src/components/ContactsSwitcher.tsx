import React from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { spacing } from '@/theme/tokens';
import { SegmentedControl } from '@/components/SegmentedControl';

type Contacts = 'customers' | 'suppliers';

const ROUTES: Record<Contacts, string> = { customers: '/customers', suppliers: '/suppliers' };

export function ContactsSwitcher({ active }: { active: Contacts }) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <SegmentedControl<Contacts>
        value={active}
        onChange={(next) => {
          if (next !== active) router.replace(ROUTES[next] as any);
        }}
        options={[
          { value: 'customers', label: t('customers.customers'), icon: 'people-outline' },
          { value: 'suppliers', label: t('suppliers.suppliers'), icon: 'business-outline' },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
});

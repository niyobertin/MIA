import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme/tokens';
import { BottomSheet } from '@/components/SegmentedControl';

type Option = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  hint: string;
  path: string;
};

export function MoreActionsSheet({
  visible,
  onClose,
  onNavigate,
}: {
  visible: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const { t } = useTranslation();
  const options: Option[] = [
    {
      icon: 'person-outline',
      label: t('navigation.customerPayment'),
      hint: t('payments.receivePayment'),
      path: '/payment/customer-payment',
    },
    {
      icon: 'business-outline',
      label: t('navigation.supplierPayment'),
      hint: t('payments.makePayment'),
      path: '/payment/supplier-payment',
    },
    {
      icon: 'people-outline',
      label: t('customers.customers'),
      hint: t('customers.totalOutstanding'),
      path: '/customers',
    },
    {
      icon: 'analytics-outline',
      label: t('navigation.reports'),
      hint: t('dashboard.summaryTitle'),
      path: '/reports',
    },
  ];
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('dashboard.moreActionsTitle')}>
      {options.map((option) => (
        <TouchableOpacity
          key={option.path}
          style={styles.option}
          onPress={() => {
            onClose();
            onNavigate(option.path);
          }}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <View style={styles.icon}>
            <Ionicons name={option.icon} size={22} color={colors.primary} />
          </View>
          <View style={styles.info}>
            <Text style={styles.label}>{option.label}</Text>
            <Text style={styles.hint}>{option.hint}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.faint} />
        </TouchableOpacity>
      ))}
      <View style={styles.spacer} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    minHeight: 64,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  info: { flex: 1 },
  label: { fontSize: 16, fontWeight: '700', color: colors.ink },
  hint: { fontSize: 14, color: colors.muted, marginTop: 2 },
  spacer: { height: spacing.lg },
});

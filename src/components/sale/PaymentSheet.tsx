import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme/tokens';
import { BottomSheet } from '@/components/SegmentedControl';
import { Button } from '@/components/Button';
import { MoneyText } from '@/components/MoneyText';
import { PAYMENT_METHODS } from '@/constants';
import { Customer, User } from '@/types';
import { CheckoutMode, PayMethod } from '@/hooks/useSaleCheckout';

const METHOD_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  cash: 'cash-outline',
  mobile_money: 'phone-portrait-outline',
  bank: 'card-outline',
  credit: 'person-outline',
};

export function PaymentSheet({
  visible,
  onClose,
  mode,
  onModeChange,
  canIssueWaiter,
  subtotal,
  discount,
  tax,
  total,
  profit,
  belowCost,
  paymentMethod,
  onPay,
  onEditCart,
  customer,
  onPickCustomer,
  waiter,
  onPickWaiter,
  clientLabel,
  onClientLabel,
  saving,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  mode: CheckoutMode;
  onModeChange: (mode: CheckoutMode) => void;
  canIssueWaiter: boolean;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  profit: number;
  belowCost: boolean;
  paymentMethod: string;
  onPay: (method: PayMethod) => void;
  onEditCart: () => void;
  customer: Customer | null;
  onPickCustomer: () => void;
  waiter: User | null;
  onPickWaiter: () => void;
  clientLabel: string;
  onClientLabel: (value: string) => void;
  saving: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const isWaiter = mode === 'waiter';
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={isWaiter ? t('sales.issueToWaiter') : t('sales.choosePayment')}
    >
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={styles.step}>{isWaiter ? t('sales.issueToWaiterHint') : t('sales.payWith')}</Text>
          <TouchableOpacity onPress={onEditCart} hitSlop={8} accessibilityRole="button">
            <Text style={styles.editCart}>{t('sales.editCart')}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.summary}>
          {discount > 0 || tax > 0 ? (
            <>
              <Row label={t('sales.subtotal')} value={subtotal} />
              {discount > 0 ? <Row label={t('sales.discount')} value={-discount} negative /> : null}
              {tax > 0 ? <Row label={t('sales.tax')} value={tax} /> : null}
            </>
          ) : null}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('sales.total')}</Text>
            <MoneyText amount={total} size={26} weight="800" color={colors.ink} />
          </View>
          {!isWaiter ? (
            <View style={styles.profitRow}>
              <Text style={styles.profitLabel}>{t('sales.profitOnSale')}</Text>
              <MoneyText amount={profit} size={15} weight="700" />
            </View>
          ) : null}
          {!isWaiter && belowCost ? <Text style={styles.warning}>{t('sales.belowCostHint')}</Text> : null}
        </View>

        {isWaiter ? (
          <>
            <PickerRow
              icon="people-circle-outline"
              title={waiter ? waiter.name : t('sales.selectWaiter')}
              subtitle={waiter?.role ? t(`users.${waiter.role.toLowerCase()}` as 'users.staff') : undefined}
              onPress={onPickWaiter}
            />
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>{t('waiterTabs.clientLabel')}</Text>
              <TextInput
                style={styles.input}
                value={clientLabel}
                onChangeText={onClientLabel}
                placeholder={t('waiterTabs.clientLabelPlaceholder')}
                placeholderTextColor={colors.faint}
                maxLength={60}
                accessibilityLabel={t('waiterTabs.clientLabel')}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.methods}>
              {PAYMENT_METHODS.map((m) => {
                const active = saving && paymentMethod === m.value;
                return (
                  <TouchableOpacity
                    key={m.value}
                    style={[styles.method, active && styles.methodActive]}
                    onPress={() => onPay(m.value as PayMethod)}
                    disabled={saving}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                  >
                    <Ionicons
                      name={METHOD_ICONS[m.value] ?? 'cash-outline'}
                      size={24}
                      color={active ? colors.primary : colors.muted}
                    />
                    <Text style={[styles.methodLabel, active && styles.methodLabelActive]}>
                      {t(`sales.${m.value === 'mobile_money' ? 'mobileMoney' : m.value}` as 'sales.cash')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {paymentMethod === 'credit' && customer ? (
              <PickerRow
                icon="person-circle-outline"
                title={customer ? customer.name : t('sales.selectCustomer')}
                subtitle={customer?.phone ?? undefined}
                onPress={onPickCustomer}
              />
            ) : null}
          </>
        )}

        {isWaiter ? (
          <Button variant="primary" size="lg" fullWidth loading={saving} onPress={onConfirm}>
            {t('sales.issueToWaiter')}
          </Button>
        ) : null}

        {canIssueWaiter ? (
          <TouchableOpacity
            onPress={() => onModeChange(isWaiter ? 'sale' : 'waiter')}
            style={styles.switch}
            accessibilityRole="button"
          >
            <Ionicons
              name={isWaiter ? 'cash-outline' : 'people-circle-outline'}
              size={18}
              color={colors.primary}
            />
            <Text style={styles.switchText}>
              {isWaiter ? t('sales.customerPaysInstead') : t('sales.giveToWaiterInstead')}
            </Text>
          </TouchableOpacity>
        ) : null}
        <View style={styles.spacer} />
      </View>
    </BottomSheet>
  );
}

function Row({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <MoneyText amount={value} size={15} weight="600" color={negative ? colors.danger : colors.body} />
    </View>
  );
}

function PickerRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.picker} onPress={onPress} activeOpacity={0.8} accessibilityRole="button">
      <Ionicons name={icon} size={28} color={colors.primary} />
      <View style={styles.pickerInfo}>
        <Text style={styles.pickerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.pickerSub}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.faint} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  step: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.muted },
  editCart: { fontSize: 15, fontWeight: '700', color: colors.primary },
  summary: { backgroundColor: colors.inputBg, borderRadius: radius.md, padding: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  rowLabel: { fontSize: 15, color: colors.body },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 17, fontWeight: '700', color: colors.ink },
  profitRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  profitLabel: { fontSize: 15, color: colors.muted },
  warning: { fontSize: 15, color: colors.danger, fontWeight: '600', marginTop: 6 },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  method: {
    flexGrow: 1,
    minWidth: '47%',
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
  },
  methodActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  methodLabel: { flexShrink: 1, fontSize: 16, fontWeight: '600', color: colors.body },
  methodLabelActive: { color: colors.primaryText, fontWeight: '700' },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    minHeight: 56,
  },
  pickerInfo: { flex: 1 },
  pickerTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  pickerSub: { fontSize: 14, color: colors.muted },
  field: { gap: 6 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: colors.muted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.inputBg,
  },
  switch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
  },
  switchText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  spacer: { height: spacing.sm },
});

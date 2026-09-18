import React from 'react';
import { View, Text, StyleSheet, RefreshControl, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { Button } from '@/components/Button';
import { MoneyText } from '@/components/MoneyText';
import { FormInput, FormScrollView } from '@/components';
import { ConfirmModal } from '@/components/ConfirmModal';
import { BottomSheet } from '@/components/SegmentedControl';
import { EmptyState } from '@/components/EmptyState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { showToast } from '@/stores/toastStore';
import {
  useCustomers,
  useSuppliers,
  usePayments,
  useCreatePayment,
  useCustomerBalance,
  useSupplierBalance,
} from '@/hooks/useData';
import { PAYMENT_METHODS } from '@/constants';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { getTodayDateString } from '@/utils/formatters';

const schema = z.object({
  partyId: z.string().min(1, 'Select a party'),
  amount: z.number().int().positive('Amount must be positive'),
  paymentMethod: z.enum(PAYMENT_METHODS.filter((p) => p.value !== 'credit').map((p) => p.value) as [string, ...string[]]),
  notes: z.string().optional(),
});

type Form = z.infer<typeof schema>;

interface PartyPaymentProps {
  kind: 'customer' | 'supplier';
  initialPartyId?: string;
}

export function PartyPaymentScreen({ kind, initialPartyId }: PartyPaymentProps) {
  const { t } = useTranslation();
  const isCustomer = kind === 'customer';
  const today = getTodayDateString();

  const { data: customers } = useCustomers();
  const { data: suppliers } = useSuppliers();
  const { data: payments, refetch: refetchPayments } = usePayments();
  const createPayment = useCreatePayment();

  const parties = (isCustomer ? customers : suppliers) ?? [];

  const { control, handleSubmit, watch, reset, setValue } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { partyId: initialPartyId ?? '', amount: 0, paymentMethod: 'cash', notes: '' },
  });

  const partyId = watch('partyId');
  const customerBalance = useCustomerBalance(isCustomer ? partyId || null : null);
  const supplierBalance = useSupplierBalance(!isCustomer ? partyId || null : null);
  const balance = isCustomer ? customerBalance.data : supplierBalance.data;

  const [showParties, setShowParties] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const selected = parties.find((p) => p.id === partyId) ?? null;
  const typeFilter = isCustomer ? 'customer_payment' : 'supplier_payment';
  const history = (payments ?? [])
    .filter((p) => p.type === typeFilter)
    .sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
    .slice(0, 10);

  const partyNameOf = (id: string | null) => parties.find((p) => p.id === id)?.name ?? '—';

  const doSave = async () => {
    const data = watch();
    try {
      if (balance && balance.outstanding > 0 && data.amount > balance.outstanding) {
        showToast(t('payments.amountExceeds'), 'warning');
      }
      await createPayment.mutateAsync({
        type: typeFilter,
        paymentMethod: data.paymentMethod as any,
        amount: data.amount,
        referenceType: isCustomer ? 'customer' : 'supplier',
        referenceId: data.partyId,
        partyId: data.partyId,
        paymentDate: today,
        notes: data.notes || undefined,
      });
      reset({ partyId: '', amount: 0, paymentMethod: 'cash', notes: '' });
      setShowConfirm(false);
      showToast(isCustomer ? t('payments.paymentReceived') : t('payments.paymentMade'), 'success');
      refetchPayments();
    } catch (error) {
      setShowConfirm(false);
      showToast(t('payments.paymentFailed'), 'error');
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={isCustomer ? t('payments.customerPayment') : t('payments.supplierPayment')}
      />
      <FormScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refetchPayments(); setRefreshing(false); }} />
        }
        showsVerticalScrollIndicator={false}
      >
        {selected && balance ? (
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>{t('payments.outstandingBalance')}</Text>
            <MoneyText amount={balance.outstanding} size={30} weight="800" color={colors.ink} />
            <Text style={styles.balanceSub}>{selected.name}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <TouchableOpacity style={styles.partyRow} onPress={() => setShowParties(true)} activeOpacity={0.8}>
            <Ionicons name={isCustomer ? 'person-circle-outline' : 'business-outline'} size={28} color={colors.primary} />
            <View style={styles.partyInfo}>
              <Text style={styles.partyName}>
                {selected ? selected.name : isCustomer ? t('payments.selectCustomer') : t('payments.selectSupplier')}
              </Text>
              {selected?.phone ? <Text style={styles.partyPhone}>{selected.phone}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.faint} />
          </TouchableOpacity>

          <FormInput
            control={control}
            name="amount"
            label={t('payments.amount')}
            placeholder={t('payments.amountPlaceholder')}
            keyboardType="numeric"
            parseValue={(v) => parseInt(v.replace(/[^\d]/g, ''), 10) || 0}
          />

          <Text style={styles.methodLabel}>{t('payments.paymentMethod')}</Text>
          <View style={styles.methodRow}>
            {PAYMENT_METHODS.filter((m) => m.value !== 'credit').map((m) => {
              const active = watch('paymentMethod') === m.value;
              return (
                <TouchableOpacity
                  key={m.value}
                  style={[styles.method, active && styles.methodActive]}
                  onPress={() => setValue('paymentMethod', m.value)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.methodText, active && styles.methodTextActive]}>
                    {t(`common.${m.value === 'mobile_money' ? 'mobileMoney' : m.value}` as any)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <FormInput
            control={control}
            name="notes"
            label={t('payments.notes')}
            placeholder={t('payments.notesPlaceholder')}
            multiline
            numberOfLines={2}
          />

          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={createPayment.isPending}
            onPress={() => handleSubmit(() => setShowConfirm(true))()}
          >
            {isCustomer ? t('payments.receivePayment') : t('payments.makePayment')}
          </Button>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('payments.recentPayments')}</Text>
          {history.length === 0 ? (
            <EmptyState icon="receipt-outline" title={t('payments.noPayments')} />
          ) : (
            history.map((p) => (
              <View key={p.id} style={styles.historyRow}>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyName} numberOfLines={1}>{partyNameOf(p.party_id)}</Text>
                  <Text style={styles.historySub}>
                    {p.payment_date.slice(0, 10)} · {t(`common.${p.payment_method === 'mobile_money' ? 'mobileMoney' : p.payment_method}` as any)}
                  </Text>
                </View>
                <MoneyText amount={p.amount} size={15} weight="700" color={isCustomer ? colors.success : colors.danger} />
              </View>
            ))
          )}
        </View>
      </FormScrollView>

      <BottomSheet
        visible={showParties}
        onClose={() => setShowParties(false)}
        title={isCustomer ? t('payments.selectCustomer') : t('payments.selectSupplier')}
      >
        <FlatList
          data={parties}
          keyExtractor={(item) => item.id}
          style={styles.partyList}
          renderItem={({ item }) => {
            const active = partyId === item.id;
            return (
              <TouchableOpacity
                style={[styles.partyOption, active && styles.partyOptionActive]}
                onPress={() => {
                  setValue('partyId', item.id);
                  setShowParties(false);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.partyAvatar}>
                  <Text style={styles.partyAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.partyInfo}>
                  <Text style={styles.partyName}>{item.name}</Text>
                  {item.phone ? <Text style={styles.partyPhone}>{item.phone}</Text> : null}
                </View>
                {active ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={styles.emptyList}>{t('common.noCustomers')}</Text>}
        />
        <View style={styles.sheetSpacer} />
      </BottomSheet>

      <ConfirmModal
        visible={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={doSave}
        title={isCustomer ? t('payments.receivePayment') : t('payments.makePayment')}
        message={`${selected?.name ?? ''} · ${(watch('amount') ?? 0).toLocaleString()} RWF`}
        confirmText={t('common.confirm')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 110,
    gap: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  balanceCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#c7d2fe',
    marginBottom: 4,
  },
  balanceSub: {
    fontSize: 13,
    color: '#e0e7ff',
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  partyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    minHeight: 60,
  },
  partyInfo: {
    flex: 1,
  },
  partyName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  partyPhone: {
    fontSize: 13,
    color: colors.muted,
  },
  methodLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  methodRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  method: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    minHeight: 48,
    justifyContent: 'center',
  },
  methodActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  methodText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    textAlign: 'center',
  },
  methodTextActive: {
    color: colors.primaryText,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: spacing.sm,
  },
  historyInfo: {
    flex: 1,
  },
  historyName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  historySub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  partyList: {
    maxHeight: 340,
  },
  partyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    gap: spacing.md,
    minHeight: 60,
  },
  partyOptionActive: {
    backgroundColor: colors.primarySoft,
  },
  partyAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },
  emptyList: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  sheetSpacer: {
    height: spacing.lg,
  },
});

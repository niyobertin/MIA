import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { Button } from '@/components/Button';
import { MoneyText } from '@/components/MoneyText';
import { FormInput } from '@/components/FormInput';
import { FormPicker } from '@/components/FormPicker';
import { ConfirmModal } from '@/components/ConfirmModal';
import { EmptyState } from '@/components/EmptyState';
import { showToast } from '@/stores/toastStore';
import { useCreatePayment, usePayments } from '@/hooks/useData';
import { PAYMENT_METHODS } from '@/constants';
import { Payment } from '@/types';
import { getTodayDateString, formatRecordDateTime } from '@/utils/formatters';
import { DateRangeBar, useDateRange } from '@/components/DateRangeFilter';

const INCOME_METHODS = PAYMENT_METHODS.filter((p) => p.value !== 'credit');

const incomeSchema = z.object({
  amount: z.number().int().positive('Amount must be positive'),
  paymentMethod: z.enum(INCOME_METHODS.map((p) => p.value) as [string, ...string[]]),
  notes: z.string().optional(),
});

type IncomeForm = z.infer<typeof incomeSchema>;

const methodKey = (method: string) => `common.${method === 'mobile_money' ? 'mobileMoney' : method}`;

export function OtherIncomePanel() {
  const { t } = useTranslation();
  const today = getTodayDateString();
  const paymentsQuery = usePayments();
  const createPayment = useCreatePayment();
  const [showConfirm, setShowConfirm] = React.useState(false);
  const dates = useDateRange('month');

  const { control, handleSubmit, watch, reset } = useForm<IncomeForm>({
    resolver: zodResolver(incomeSchema),
    defaultValues: { amount: 0, paymentMethod: 'cash', notes: '' },
  });

  const income = (paymentsQuery.data ?? []).filter((p: Payment) => p.type === 'other_income');
  const todayTotal = income
    .filter((p) => p.payment_date.slice(0, 10) === today)
    .reduce((sum, p) => sum + p.amount, 0);

  const shown = dates.filter(income, (p) => p.payment_date);

  const doSave = async () => {
    const data = watch();
    try {
      await createPayment.mutateAsync({
        type: 'other_income',
        paymentMethod: data.paymentMethod as Payment['payment_method'],
        amount: data.amount,
        referenceType: 'other',
        referenceId: null,
        partyId: null,
        paymentDate: today,
        notes: data.notes || null,
      });
      reset({ amount: 0, paymentMethod: 'cash', notes: '' });
      setShowConfirm(false);
      showToast(t('expenses.incomeSaved'), 'success');
      await paymentsQuery.refetch();
    } catch (error) {
      setShowConfirm(false);
      const code = error instanceof Error ? error.message : '';
      if (code === 'DAY_CLOSED') showToast(t('cash.dayAlreadyClosed'), 'error');
      else showToast(t('expenses.incomeFailed'), 'error');
    }
  };

  return (
    <>
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>{t('expenses.todayIncome')}</Text>
        <MoneyText amount={todayTotal} size={30} weight="800" color={colors.ink} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('expenses.addIncome')}</Text>
        <FormInput
          control={control}
          name="amount"
          label={t('expenses.amount')}
          placeholder={t('expenses.amountPlaceholder')}
          keyboardType="numeric"
          parseValue={(v) => parseInt(v.replace(/[^\d]/g, ''), 10) || 0}
        />
        <FormPicker control={control} name="paymentMethod" label={t('expenses.receivedAs')}>
          {INCOME_METHODS.map((pm) => (
            <Picker.Item key={pm.value} label={t(methodKey(pm.value) as any)} value={pm.value} />
          ))}
        </FormPicker>
        <FormInput
          control={control}
          name="notes"
          label={t('expenses.incomeSource')}
          placeholder={t('expenses.incomeSourcePlaceholder')}
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
          {t('common.save')}
        </Button>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('expenses.recentIncome')}</Text>
        <DateRangeBar value={dates.range} onChange={dates.setRange} count={shown.length} />
        {shown.length === 0 ? (
          <EmptyState icon="trending-up-outline" title={t('expenses.noIncome')} />
        ) : (
          shown.map((p) => (
            <View key={p.id} style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {p.notes || t('expenses.otherIncome')}
                </Text>
                <Text style={styles.rowSub}>
                  {formatRecordDateTime(p.created_at || p.payment_date)} · {t(methodKey(p.payment_method) as any)}
                </Text>
              </View>
              <MoneyText amount={p.amount} size={15} weight="700" color={colors.success} />
            </View>
          ))
        )}
      </View>

      <ConfirmModal
        visible={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => void doSave()}
        title={t('expenses.addIncome')}
        message={`${t('expenses.amount')}: ${(watch('amount') ?? 0).toLocaleString()} RWF`}
        confirmText={t('common.save')}
        variant="primary"
        loading={createPayment.isPending}
      />
    </>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    ...shadows.card,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.muted,
    marginBottom: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.card,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    gap: spacing.md,
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
});

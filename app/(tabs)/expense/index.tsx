import React from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { Button } from '@/components/Button';
import { MoneyText } from '@/components/MoneyText';
import { FormInput, FormPicker, FormScrollView } from '@/components';
import { ConfirmModal } from '@/components/ConfirmModal';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { showToast } from '@/stores/toastStore';
import { useCreateExpense, useExpenses } from '@/hooks/useData';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/constants';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES.map((c) => c.value) as [string, ...string[]]),
  amount: z.number().int().positive('Amount must be positive'),
  paymentMethod: z.enum(PAYMENT_METHODS.map((p) => p.value) as [string, ...string[]]),
  description: z.string().optional(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
});

type ExpenseForm = z.infer<typeof expenseSchema>;

const categoryTone: Record<string, 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  rent: 'info',
  salary: 'info',
  transport: 'warning',
  electricity: 'warning',
  water: 'warning',
  communication: 'warning',
  food: 'neutral',
  maintenance: 'neutral',
  tax: 'danger',
  other: 'neutral',
};

export default function ExpenseScreen() {
  const { t } = useTranslation();
  const today = new Date().toISOString().split('T')[0];
  const createExpenseMutation = useCreateExpense();
  const expensesQuery = useExpenses();
  const [refreshing, setRefreshing] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);

  const { control, handleSubmit, watch, reset } = useForm<ExpenseForm>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      category: 'other',
      amount: 0,
      paymentMethod: 'cash',
      description: '',
      expenseDate: today,
    },
  });

  const expenses = expensesQuery.data ?? [];
  const todayTotal = expenses
    .filter((e) => e.expense_date.slice(0, 10) === today)
    .reduce((sum, e) => sum + e.amount, 0);
  const recent = [...expenses]
    .sort((a, b) => (b.created_at > a.created_at ? 1 : -1))
    .slice(0, 10);

  const doSave = async () => {
    const data = watch();
    try {
      await createExpenseMutation.mutateAsync({
        category: data.category as any,
        amount: data.amount,
        paymentMethod: data.paymentMethod as any,
        description: data.description || undefined,
        expenseDate: data.expenseDate,
      });
      reset({ category: 'other', amount: 0, paymentMethod: 'cash', description: '', expenseDate: today });
      setShowConfirm(false);
      showToast(t('expenses.expenseAdded'), 'success');
      expensesQuery.refetch();
    } catch (error) {
      setShowConfirm(false);
      showToast(t('expenses.expenseFailed'), 'error');
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('expenses.expenses')} />
      <FormScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await expensesQuery.refetch(); setRefreshing(false); }} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>{t('expenses.todayExpenses')}</Text>
          <MoneyText amount={todayTotal} size={30} weight="800" color={colors.ink} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('expenses.addExpense')}</Text>
          <FormPicker control={control} name="category" label={t('expenses.category')}>
            {EXPENSE_CATEGORIES.map((cat) => (
              <Picker.Item key={cat.value} label={t(`expenses.${cat.value}` as any)} value={cat.value} />
            ))}
          </FormPicker>
          <FormInput
            control={control}
            name="amount"
            label={t('expenses.amount')}
            placeholder={t('expenses.amountPlaceholder')}
            keyboardType="numeric"
            parseValue={(v) => parseInt(v.replace(/[^\d]/g, ''), 10) || 0}
          />
          <FormPicker control={control} name="paymentMethod" label={t('expenses.paymentMethod')}>
            {PAYMENT_METHODS.map((pm) => (
              <Picker.Item
                key={pm.value}
                label={t(`common.${pm.value === 'mobile_money' ? 'mobileMoney' : pm.value}` as any)}
                value={pm.value}
              />
            ))}
          </FormPicker>
          <FormInput
            control={control}
            name="description"
            label={t('expenses.description')}
            placeholder={t('expenses.descriptionPlaceholder')}
            multiline
            numberOfLines={2}
          />
          <Button variant="primary" size="lg" fullWidth loading={createExpenseMutation.isPending} onPress={() => handleSubmit(() => setShowConfirm(true))()}>
            {t('common.save')}
          </Button>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('expenses.recentExpenses')}</Text>
          {recent.length === 0 ? (
            <EmptyState icon="wallet-outline" title={t('expenses.noExpenses')} />
          ) : (
            recent.map((e) => (
              <View key={e.id} style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {e.description || t(`expenses.${e.category}` as any)}
                  </Text>
                  <Text style={styles.rowSub}>{e.expense_date.slice(0, 10)}</Text>
                </View>
                <View style={styles.rowRight}>
                  <MoneyText amount={e.amount} size={15} weight="700" color={colors.ink} />
                  <StatusBadge label={t(`expenses.${e.category}` as any)} tone={categoryTone[e.category] ?? 'neutral'} />
                </View>
              </View>
            ))
          )}
        </View>
      </FormScrollView>

      <ConfirmModal
        visible={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={doSave}
        title={t('expenses.addExpense')}
        message={`${t('expenses.amount')}: ${(watch('amount') ?? 0).toLocaleString()} RWF`}
        confirmText={t('common.save')}
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
    gap: spacing.md,
    ...shadows.card,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: spacing.sm,
  },
  rowInfo: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  rowSub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
});

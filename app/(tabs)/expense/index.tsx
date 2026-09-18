import React from 'react';
import { View, Text, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import {
  useCreateExpense,
  useUpdateExpense,
  useDeleteExpense,
  useExpenses,
} from '@/hooks/useData';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/constants';
import { Expense } from '@/types';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { getTodayDateString } from '@/utils/formatters';

const EXPENSE_PAYMENT_METHODS = PAYMENT_METHODS.filter((p) => p.value !== 'credit');

const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES.map((c) => c.value) as [string, ...string[]]),
  amount: z.number().int().positive('Amount must be positive'),
  paymentMethod: z.enum(EXPENSE_PAYMENT_METHODS.map((p) => p.value) as [string, ...string[]]),
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
  const today = getTodayDateString();
  const createExpenseMutation = useCreateExpense();
  const updateExpenseMutation = useUpdateExpense();
  const deleteExpenseMutation = useDeleteExpense();
  const expensesQuery = useExpenses();
  const [refreshing, setRefreshing] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [editing, setEditing] = React.useState<Expense | null>(null);
  const [deleting, setDeleting] = React.useState<Expense | null>(null);

  const { control, handleSubmit, watch, reset, setValue } = useForm<ExpenseForm>({
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
    .slice(0, 50);

  const resetForm = () => {
    setEditing(null);
    reset({
      category: 'other',
      amount: 0,
      paymentMethod: 'cash',
      description: '',
      expenseDate: today,
    });
  };

  const startEdit = (expense: Expense) => {
    setEditing(expense);
    setValue('category', expense.category);
    setValue('amount', expense.amount);
    setValue(
      'paymentMethod',
      (expense.payment_method === 'credit' ? 'cash' : expense.payment_method) as ExpenseForm['paymentMethod']
    );
    setValue('description', expense.description ?? '');
    setValue('expenseDate', expense.expense_date.slice(0, 10));
  };

  const doSave = async () => {
    const data = watch();
    try {
      if (editing) {
        await updateExpenseMutation.mutateAsync({
          id: editing.id,
          updates: {
            category: data.category as Expense['category'],
            amount: data.amount,
            paymentMethod: data.paymentMethod as Expense['payment_method'],
            description: data.description || undefined,
            expenseDate: data.expenseDate,
          },
        });
        showToast(t('expenses.expenseUpdated'), 'success');
      } else {
        await createExpenseMutation.mutateAsync({
          category: data.category as any,
          amount: data.amount,
          paymentMethod: data.paymentMethod as any,
          description: data.description || undefined,
          expenseDate: data.expenseDate,
        });
        showToast(t('expenses.expenseAdded'), 'success');
      }
      resetForm();
      setShowConfirm(false);
      await expensesQuery.refetch();
    } catch {
      setShowConfirm(false);
      showToast(t('expenses.expenseFailed'), 'error');
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    try {
      await deleteExpenseMutation.mutateAsync(deleting.id);
      if (editing?.id === deleting.id) resetForm();
      setDeleting(null);
      showToast(t('expenses.expenseDeleted'), 'success');
      await expensesQuery.refetch();
    } catch {
      showToast(t('expenses.expenseFailed'), 'error');
    }
  };

  const saving = createExpenseMutation.isPending || updateExpenseMutation.isPending;

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('expenses.expenses')} />
      <FormScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await expensesQuery.refetch();
              setRefreshing(false);
            }}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>{t('expenses.todayExpenses')}</Text>
          <MoneyText amount={todayTotal} size={30} weight="800" color={colors.ink} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>
              {editing ? t('expenses.editExpense') : t('expenses.addExpense')}
            </Text>
            {editing ? (
              <TouchableOpacity onPress={resetForm} hitSlop={8}>
                <Text style={styles.cancelEdit}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
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
          <FormInput
            control={control}
            name="expenseDate"
            label={t('expenses.date')}
            placeholder="YYYY-MM-DD"
          />
          <FormPicker control={control} name="paymentMethod" label={t('expenses.paymentMethod')}>
            {EXPENSE_PAYMENT_METHODS.map((pm) => (
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
          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={saving}
            onPress={() => handleSubmit(() => setShowConfirm(true))()}
          >
            {editing ? t('common.update') : t('common.save')}
          </Button>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('expenses.recentExpenses')}</Text>
          {recent.length === 0 ? (
            <EmptyState icon="wallet-outline" title={t('expenses.noExpenses')} />
          ) : (
            recent.map((e) => (
              <View key={e.id} style={styles.row}>
                <TouchableOpacity style={styles.rowMain} onPress={() => startEdit(e)} activeOpacity={0.8}>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {e.description || t(`expenses.${e.category}` as any)}
                    </Text>
                    <Text style={styles.rowSub}>
                      {e.expense_date.slice(0, 10)} ·{' '}
                      {t(
                        `common.${e.payment_method === 'mobile_money' ? 'mobileMoney' : e.payment_method}` as any
                      )}
                    </Text>
                  </View>
                  <View style={styles.rowRight}>
                    <MoneyText amount={e.amount} size={15} weight="700" color={colors.ink} />
                    <StatusBadge
                      label={t(`expenses.${e.category}` as any)}
                      tone={categoryTone[e.category] ?? 'neutral'}
                    />
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => startEdit(e)} hitSlop={8}>
                  <Ionicons name="create-outline" size={20} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => setDeleting(e)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </FormScrollView>

      <ConfirmModal
        visible={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={() => void doSave()}
        title={editing ? t('expenses.editExpense') : t('expenses.addExpense')}
        message={`${t('expenses.amount')}: ${(watch('amount') ?? 0).toLocaleString()} RWF`}
        confirmText={editing ? t('common.update') : t('common.save')}
        variant="primary"
        loading={saving}
      />

      <ConfirmModal
        visible={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void doDelete()}
        title={t('expenses.deleteExpense')}
        message={t('expenses.deleteExpenseConfirm')}
        confirmText={t('common.delete')}
        variant="danger"
        loading={deleteExpenseMutation.isPending}
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  cancelEdit: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: 2,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

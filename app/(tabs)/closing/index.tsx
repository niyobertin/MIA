import React from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { Button } from '@/components/Button';
import { MoneyText } from '@/components/MoneyText';
import { FormInput } from '@/components/FormInput';
import { FormScrollView } from '@/components/FormScrollView';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { showToast } from '@/stores/toastStore';
import { canCloseDay } from '@/utils/permissions';
import { useForm } from 'react-hook-form';
import {
  useOpenDailyClosing,
  useDailyClosing,
  useCloseDay,
  useStartDay,
  useDailyFinancials,
} from '@/hooks/useData';
import { useAuthStore } from '@/stores/authStore';
import { getTodayDateString } from '@/utils/formatters';

interface DayForm {
  openingCash: string;
  actualCash: string;
  notes?: string;
}

export default function ClosingScreen() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const today = getTodayDateString();

  const openClosingQuery = useOpenDailyClosing();
  const todayClosingQuery = useDailyClosing(today);
  const financialsQuery = useDailyFinancials(today);
  const closeDayMutation = useCloseDay();
  const startDayMutation = useStartDay();

  const todayClosing = todayClosingQuery.data;
  const openClosing = openClosingQuery.data;
  const activeOpen = todayClosing?.status === 'open' ? todayClosing : openClosing?.status === 'open' ? openClosing : null;
  const isClosed = todayClosing?.status === 'closed';
  const needsStart = !isClosed && !activeOpen;

  const { control, handleSubmit, watch, setValue } = useForm<DayForm>({
    defaultValues: {
      openingCash: activeOpen ? String(activeOpen.opening_cash) : '',
      actualCash: '',
      notes: '',
    },
  });

  React.useEffect(() => {
    if (activeOpen) {
      setValue('openingCash', String(activeOpen.opening_cash ?? 0));
    }
  }, [activeOpen?.id, activeOpen?.opening_cash, setValue]);

  const [showConfirm, setShowConfirm] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const fin = financialsQuery.data;
  const openingCash = parseInt(watch('openingCash')?.replace(/[^\d]/g, '') || '0', 10) || 0;
  const actualCash = parseInt(watch('actualCash')?.replace(/[^\d]/g, '') || '0', 10) || 0;

  const expectedCash =
    openingCash +
    (fin?.cashSales ?? 0) +
    (fin?.customerCashPayments ?? 0) +
    (fin?.otherCashIncome ?? 0) -
    (fin?.cashPurchases ?? 0) -
    (fin?.cashExpenses ?? 0) -
    (fin?.supplierCashPayments ?? 0) -
    (fin?.withdrawals ?? 0);
  const variance = actualCash - expectedCash;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([openClosingQuery.refetch(), todayClosingQuery.refetch(), financialsQuery.refetch()]);
    setRefreshing(false);
  };

  const doStart = async (values: DayForm) => {
    try {
      const cash = parseInt(values.openingCash?.replace(/[^\d]/g, '') || '0', 10) || 0;
      await startDayMutation.mutateAsync({
        businessDate: today,
        openingCash: cash,
        notes: values.notes || undefined,
      });
      showToast(t('cash.dayStarted'), 'success');
      await Promise.all([openClosingQuery.refetch(), todayClosingQuery.refetch()]);
    } catch (error: any) {
      if (error?.message === 'DAY_ALREADY_OPEN') {
        showToast(t('cash.dayAlreadyOpen'), 'info');
      } else if (error?.message === 'DAY_ALREADY_CLOSED') {
        showToast(t('cash.dayAlreadyClosed'), 'error');
      } else {
        showToast(t('common.error'), 'error');
      }
    }
  };

  const doClose = async () => {
    try {
      await closeDayMutation.mutateAsync({
        businessDate: today,
        openingCash,
        actualCash,
        notes: watch('notes') || undefined,
      });
      setShowConfirm(false);
      showToast(t('cash.dayClosed'), 'success');
      openClosingQuery.refetch();
      todayClosingQuery.refetch();
    } catch {
      setShowConfirm(false);
      showToast(t('common.error'), 'error');
    }
  };

  if (!canCloseDay(user?.role)) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title={t('cash.cashDay')} />
        <EmptyState icon="lock-closed" title={t('cash.noPermission')} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={needsStart ? t('cash.startOfDay') : t('cash.endOfDay')}
        subtitle={needsStart ? t('cash.startDayDesc') : t('cash.closeDayDesc')}
      />
      <FormScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {openClosingQuery.isLoading || todayClosingQuery.isLoading || financialsQuery.isLoading ? (
          <Skeleton height={220} style={styles.skel} />
        ) : isClosed && todayClosing ? (
          <View style={styles.closedCard}>
            <View style={styles.closedIcon}>
              <Ionicons name="checkmark" size={30} color="#fff" />
            </View>
            <Text style={styles.closedTitle}>{t('cash.dayAlreadyClosed')}</Text>
            <View style={styles.closedRows}>
              <ClosedRow label={t('cash.openingCash')} value={todayClosing.opening_cash} />
              <ClosedRow label={t('dashboard.sales')} value={todayClosing.total_sales} />
              <ClosedRow label={t('cash.expectedCash')} value={todayClosing.expected_cash} />
              <ClosedRow label={t('cash.actualCash')} value={todayClosing.actual_cash} />
              <ClosedRow
                label={t('cash.cashVariance')}
                value={todayClosing.cash_variance}
                color={todayClosing.cash_variance >= 0 ? colors.success : colors.danger}
              />
              <ClosedRow label={t('dashboard.grossProfit')} value={todayClosing.gross_profit} />
              <ClosedRow label={t('dashboard.netProfit')} value={todayClosing.net_profit} />
            </View>
          </View>
        ) : needsStart ? (
          <>
            <View style={styles.infoCard}>
              <Ionicons name="sunny-outline" size={28} color={colors.primary} />
              <View style={styles.infoText}>
                <Text style={styles.infoTitle}>{t('cash.startDayTitle')}</Text>
                <Text style={styles.infoBody}>{t('cash.startDayHint')}</Text>
              </View>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('cash.openingCash')}</Text>
              <FormInput
                control={control}
                name="openingCash"
                label={t('cash.openingCash')}
                placeholder={t('cash.openingCashPlaceholder')}
                keyboardType="numeric"
                parseValue={(v: string) => v.replace(/[^\d]/g, '')}
              />
              <FormInput
                control={control}
                name="notes"
                label={t('cash.varianceNote')}
                placeholder={t('cash.startNotesPlaceholder')}
                multiline
                numberOfLines={2}
              />
            </View>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={startDayMutation.isPending}
              onPress={handleSubmit(doStart)}
              leftIcon={<Ionicons name="play" size={18} color="#fff" />}
            >
              {t('cash.startDay')}
            </Button>
          </>
        ) : (
          <>
            <View style={styles.openBadge}>
              <Ionicons name="ellipse" size={10} color={colors.success} />
              <Text style={styles.openBadgeText}>{t('cash.dayIsOpen')}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('dashboard.today')}</Text>
              <FlowRow label={t('cash.openingCash')} value={openingCash} />
              <FlowRow label={t('dashboard.sales')} value={fin?.totalSales ?? 0} />
              <FlowRow label={t('cash.cashSales')} value={fin?.cashSales ?? 0} />
              <FlowRow label={t('cash.cashExpenses')} value={-(fin?.cashExpenses ?? 0)} negative />
              <FlowRow label={t('cash.cashPurchases')} value={-(fin?.cashPurchases ?? 0)} negative />
              <View style={styles.divider} />
              <FlowRow label={t('dashboard.grossProfit')} value={fin?.grossProfit ?? 0} strong />
              <FlowRow label={t('dashboard.netProfit')} value={fin?.netProfit ?? 0} strong />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('cash.cashReconciliation')}</Text>
              <FormInput
                control={control}
                name="openingCash"
                label={t('cash.openingCash')}
                placeholder={t('cash.openingCashPlaceholder')}
                keyboardType="numeric"
                parseValue={(v: string) => v.replace(/[^\d]/g, '')}
              />
              <FormInput
                control={control}
                name="actualCash"
                label={t('cash.actualCash')}
                placeholder={t('cash.actualCashPlaceholder')}
                keyboardType="numeric"
                parseValue={(v: string) => v.replace(/[^\d]/g, '')}
              />
              <FormInput
                control={control}
                name="notes"
                label={t('cash.varianceNote')}
                placeholder={t('cash.varianceNotePlaceholder')}
                multiline
                numberOfLines={2}
              />
            </View>

            <View style={StyleSheet.flatten([styles.card, styles.resultCard])}>
              <FlowRow label={t('cash.expectedCash')} value={expectedCash} strong />
              <FlowRow label={t('cash.actualCash')} value={actualCash} strong />
              <View style={styles.divider} />
              <View style={styles.varianceRow}>
                <Text style={styles.varianceLabel}>{t('cash.cashVariance')}</Text>
                <MoneyText amount={variance} size={22} weight="800" />
              </View>
              <Text style={styles.varianceHint}>
                {variance === 0
                  ? t('cash.cashExact')
                  : variance > 0
                    ? t('cash.cashAbove', { amount: `${variance.toLocaleString()} RWF` })
                    : t('cash.cashBelow', { amount: `${Math.abs(variance).toLocaleString()} RWF` })}
              </Text>
            </View>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={closeDayMutation.isPending}
              onPress={() => handleSubmit(() => setShowConfirm(true))()}
              leftIcon={<Ionicons name="moon" size={18} color="#fff" />}
            >
              {t('cash.closeDay')}
            </Button>
          </>
        )}
      </FormScrollView>

      <ConfirmModal
        visible={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={doClose}
        title={t('cash.confirmCloseDay')}
        message={
          variance !== 0
            ? `${t('cash.closeDayWithVariance')} ${variance >= 0 ? '+' : ''}${variance.toLocaleString()} RWF`
            : t('cash.confirmCloseDayMessage')
        }
        confirmText={t('cash.closeDay')}
        variant="danger"
      />
    </View>
  );
}

function FlowRow({ label, value, negative, strong }: { label: string; value: number; negative?: boolean; strong?: boolean }) {
  return (
    <View style={styles.flowRow}>
      <Text style={StyleSheet.flatten([styles.flowLabel, strong ? styles.flowLabelStrong : null])}>{label}</Text>
      <MoneyText amount={value} size={strong ? 16 : 14} weight={strong ? '700' : '600'} color={negative ? colors.danger : undefined} />
    </View>
  );
}

function ClosedRow({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.flowRow}>
      <Text style={styles.flowLabel}>{label}</Text>
      <MoneyText amount={value} size={15} weight="700" color={color ?? colors.ink} />
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
  skel: {
    borderRadius: radius.lg,
  },
  infoCard: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primaryText,
  },
  infoBody: {
    fontSize: 13,
    color: colors.primaryText,
    marginTop: 4,
    lineHeight: 18,
  },
  openBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  openBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.successText,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.card,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  flowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  flowLabel: {
    fontSize: 14,
    color: colors.body,
  },
  flowLabelStrong: {
    fontWeight: '700',
    color: colors.ink,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSoft,
    marginVertical: spacing.sm,
  },
  resultCard: {
    backgroundColor: colors.inputBg,
  },
  varianceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  varianceLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  varianceHint: {
    fontSize: 13,
    color: colors.muted,
    marginTop: spacing.sm,
  },
  closedCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadows.card,
  },
  closedIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  closedTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: spacing.lg,
  },
  closedRows: {
    width: '100%',
  },
});

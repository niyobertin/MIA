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
  useCloseDay,
  useStartDay,
  useLatestClosing,
  useDailyFinancials,
  useStockSnapshot,
  useDayStockLines,
  useTrackedStock,
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
  const activeOpen = openClosingQuery.data?.status === 'open' ? openClosingQuery.data : null;
  const sessionStart = activeOpen?.business_date?.slice(0, 10) ?? today;
  const financialsQuery = useDailyFinancials(sessionStart, today);
  const stockQuery = useStockSnapshot();
  const linesQuery = useDayStockLines({
    closingId: activeOpen?.id ?? null,
    businessDate: activeOpen ? null : today,
  });
  const trackedQuery = useTrackedStock();
  const closeDayMutation = useCloseDay();
  const startDayMutation = useStartDay();
  const latestClosingQuery = useLatestClosing();

  const needsStart = !activeOpen;
  const lastClosed = latestClosingQuery.data;

  const { control, handleSubmit, watch, setValue } = useForm<DayForm>({
    defaultValues: {
      openingCash: activeOpen ? String(activeOpen.opening_cash) : '',
      actualCash: '',
      notes: '',
    },
  });

  const didPrefillOpening = React.useRef(false);
  React.useEffect(() => {
    if (activeOpen) {
      setValue('openingCash', String(activeOpen.opening_cash ?? 0));
      return;
    }
    if (didPrefillOpening.current || !needsStart) return;
    const counted = lastClosed?.actual_cash;
    if (counted == null) return;
    setValue('openingCash', String(counted));
    didPrefillOpening.current = true;
  }, [activeOpen, needsStart, lastClosed?.actual_cash, setValue]);

  const [showConfirm, setShowConfirm] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const fin = financialsQuery.data;
  const liveStock = stockQuery.data;
  const openingStockQty = activeOpen?.opening_stock_qty ?? liveStock?.quantity ?? 0;
  const openingStockValue = activeOpen?.opening_stock_value ?? liveStock?.value ?? 0;
  const availableStockQty = liveStock?.quantity ?? 0;
  const availableStockValue = liveStock?.value ?? 0;
  const savedLines = linesQuery.data ?? [];
  const openingRows = (trackedQuery.data ?? []).map((row) => ({
    id: row.product_id,
    name: row.name,
    qty: row.balance,
  }));
  const closingRows = (trackedQuery.data ?? []).map((row) => {
    const saved = savedLines.find((line) => line.product_id === row.product_id);
    return {
      id: row.product_id,
      name: row.name,
      qty: row.balance,
      opening: saved?.opening_qty ?? null,
    };
  });

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
    await Promise.all([
      openClosingQuery.refetch(),
      financialsQuery.refetch(),
      stockQuery.refetch(),
      linesQuery.refetch(),
      trackedQuery.refetch(),
      latestClosingQuery.refetch(),
    ]);
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
      didPrefillOpening.current = false;
      setValue('actualCash', '');
      setValue('notes', '');
      showToast(t('cash.dayStarted'), 'success');
      await Promise.all([openClosingQuery.refetch(), linesQuery.refetch()]);
    } catch (error: any) {
      if (error?.message === 'DAY_ALREADY_OPEN') {
        showToast(t('cash.dayAlreadyOpen'), 'info');
      } else {
        showToast(t('common.error'), 'error');
      }
    }
  };

  const doClose = async () => {
    try {
      await closeDayMutation.mutateAsync({
        closingId: activeOpen?.id,
        businessDate: sessionStart,
        openingCash,
        actualCash,
        notes: watch('notes') || undefined,
      });
      setShowConfirm(false);
      didPrefillOpening.current = false;
      setValue('actualCash', '');
      setValue('notes', '');
      showToast(t('cash.dayClosed'), 'success');
      await Promise.all([openClosingQuery.refetch(), latestClosingQuery.refetch()]);
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
        {openClosingQuery.isLoading || financialsQuery.isLoading || stockQuery.isLoading ? (
          <Skeleton height={220} style={styles.skel} />
        ) : needsStart ? (
          <>
            <View style={styles.infoCard}>
              <Ionicons name="sunny-outline" size={28} color={colors.primary} />
              <View style={styles.infoText}>
                <Text style={styles.infoTitle}>{t('cash.startDayTitle')}</Text>
                <Text style={styles.infoBody}>{t('cash.startDayAnyTime')}</Text>
              </View>
            </View>
            {lastClosed ? (
              <View style={styles.lastClosedCard}>
                <Text style={styles.lastClosedTitle}>{t('cash.lastClosedSession')}</Text>
                <ClosedCountRow
                  label={t('cash.businessDate')}
                  value={lastClosed.business_date}
                />
                <ClosedRow label={t('cash.actualCash')} value={lastClosed.actual_cash} />
                <ClosedCountRow
                  label={t('cash.availableStock')}
                  value={`${(lastClosed.closing_stock_qty ?? 0).toLocaleString()} ${t('cash.stockUnits')}`}
                />
              </View>
            ) : null}
            <StockCard
              title={t('cash.openingStock')}
              quantity={liveStock?.quantity ?? 0}
              value={liveStock?.value ?? 0}
              unitsLabel={t('cash.stockUnits')}
              valueLabel={t('cash.stockValue')}
            />
            <ItemQtyList
              title={t('cash.openingItems')}
              rows={openingRows}
              emptyLabel={t('cash.noStockItems')}
              qtyLabel={t('cash.openingStock')}
            />
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
              <Text style={styles.openBadgeText}>
                {t('cash.dayIsOpen')} · {sessionStart}
                {sessionStart !== today ? ` → ${today}` : ''}
              </Text>
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

            <StockCard
              title={t('cash.openingStock')}
              quantity={openingStockQty}
              value={openingStockValue}
              unitsLabel={t('cash.stockUnits')}
              valueLabel={t('cash.stockValue')}
            />
            <ItemQtyList
              title={t('cash.openingItems')}
              rows={savedLines.length
                ? savedLines.map((line) => ({
                    id: line.product_id,
                    name: line.product_name ?? line.product_id,
                    qty: line.opening_qty,
                  }))
                : openingRows}
              emptyLabel={t('cash.noStockItems')}
              qtyLabel={t('cash.openingStock')}
            />
            <StockCard
              title={t('cash.availableStock')}
              quantity={availableStockQty}
              value={availableStockValue}
              unitsLabel={t('cash.stockUnits')}
              valueLabel={t('cash.stockValue')}
            />
            <ItemQtyList
              title={t('cash.closingItems')}
              rows={closingRows}
              emptyLabel={t('cash.noStockItems')}
              qtyLabel={t('cash.availableStock')}
              showOpening
              openingLabel={t('cash.openingStock')}
            />

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

function ItemQtyList({
  title,
  rows,
  emptyLabel,
  qtyLabel,
  showOpening,
  openingLabel,
}: {
  title: string;
  rows: Array<{ id: string; name: string; qty: number; opening?: number | null }>;
  emptyLabel: string;
  qtyLabel: string;
  showOpening?: boolean;
  openingLabel?: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.itemHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.itemHeaderQty}>{qtyLabel}</Text>
      </View>
      {rows.length === 0 ? <Text style={styles.flowLabel}>{emptyLabel}</Text> : null}
      {rows.map((row) => (
        <View key={row.id} style={styles.itemRow}>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName} numberOfLines={1}>{row.name}</Text>
            {showOpening && row.opening != null ? (
              <Text style={styles.itemMeta}>
                {openingLabel}: {row.opening.toLocaleString()}
              </Text>
            ) : null}
          </View>
          <Text style={styles.itemQtyValue}>{row.qty.toLocaleString()}</Text>
        </View>
      ))}
    </View>
  );
}

function StockCard({
  title,
  quantity,
  value,
  unitsLabel,
  valueLabel,
}: {
  title: string;
  quantity: number;
  value: number;
  unitsLabel: string;
  valueLabel: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.flowRow}>
        <Text style={styles.flowLabel}>{unitsLabel}</Text>
        <Text style={styles.qtyValue}>{quantity.toLocaleString()}</Text>
      </View>
      <View style={styles.flowRow}>
        <Text style={styles.flowLabel}>{valueLabel}</Text>
        <MoneyText amount={value} size={14} weight="600" />
      </View>
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

function ClosedCountRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.flowRow}>
      <Text style={styles.flowLabel}>{label}</Text>
      <Text style={styles.qtyValue}>{value}</Text>
    </View>
  );
}

function ClosedRow({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.flowRow}>
      <Text style={styles.flowLabel}>{label}</Text>
      <MoneyText amount={value} size={14} weight="600" color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48 },
  skel: { borderRadius: radius.lg, marginBottom: spacing.md },
  infoCard: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  infoText: { flex: 1 },
  infoTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  infoBody: { fontSize: 13, color: colors.body, marginTop: 4, lineHeight: 18 },
  lastClosedCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  lastClosedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  openBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    marginBottom: spacing.md,
  },
  openBadgeText: { fontSize: 13, fontWeight: '700', color: colors.successText },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  resultCard: { marginBottom: spacing.lg },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.ink, marginBottom: spacing.sm },
  flowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  flowLabel: { fontSize: 14, color: colors.body, flex: 1, paddingRight: spacing.sm },
  flowLabelStrong: { fontWeight: '700', color: colors.ink },
  qtyValue: { fontSize: 15, fontWeight: '800', color: colors.ink },
  divider: { height: 1, backgroundColor: colors.borderSoft, marginVertical: spacing.sm },
  varianceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  varianceLabel: { fontSize: 15, fontWeight: '700', color: colors.ink },
  varianceHint: { marginTop: spacing.sm, fontSize: 13, color: colors.muted },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  itemHeaderQty: { fontSize: 12, fontWeight: '700', color: colors.muted },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: spacing.md,
  },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  itemMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  itemQtyValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
    minWidth: 48,
    textAlign: 'right',
  },
});

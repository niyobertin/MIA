import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { MoneyText } from '@/components/MoneyText';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { FilterChip } from '@/components/FilterChip';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useSaleItems } from '@/hooks/useData';
import { formatNumber, formatRecordDateTime } from '@/utils/formatters';

export type HistoryFilter = 'openDay' | 'today' | 'week' | 'month' | 'all';

export type HistorySale = {
  id: string;
  reference_number: string | null;
  total_amount: number;
  paid_amount?: number;
  payment_status: string;
  customer_id: string | null;
  created_at: string;
  sale_date?: string;
  notes?: string | null;
  voided?: boolean;
};

export function SaleHistoryList({
  sales,
  loading,
  showDate,
  filter,
  hasOpenDay,
  onFilterChange,
  customerNameOf,
  productNameOf,
  voiding,
  onVoid,
}: {
  sales: HistorySale[];
  loading: boolean;
  showDate: boolean;
  filter: HistoryFilter;
  hasOpenDay: boolean;
  onFilterChange: (filter: HistoryFilter) => void;
  customerNameOf: (id: string | null) => string;
  productNameOf: (id: string) => string;
  voiding: boolean;
  onVoid: (saleId: string) => void;
}) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [pendingVoidId, setPendingVoidId] = React.useState<string | null>(null);

  const filters: { value: HistoryFilter; label: string }[] = [
    ...(hasOpenDay ? [{ value: 'openDay' as const, label: t('sales.openDayFilter') }] : []),
    { value: 'today', label: t('reports.today') },
    { value: 'week', label: t('reports.thisWeek') },
    { value: 'month', label: t('reports.thisMonth') },
    { value: 'all', label: t('sales.allTime') },
  ];

  const stats = React.useMemo(() => {
    const active = sales.filter((s) => !s.voided);
    const voidedCount = sales.length - active.length;
    const total = active.reduce((sum, s) => sum + (s.total_amount ?? 0), 0);
    const credit = active
      .filter((s) => s.payment_status === 'credit' || s.payment_status === 'partial' || s.payment_status === 'unpaid')
      .reduce((sum, s) => sum + Math.max(0, (s.total_amount ?? 0) - (s.paid_amount ?? 0)), 0);
    const count = active.length;
    return {
      total,
      count,
      credit,
      average: count > 0 ? Math.round(total / count) : 0,
      voidedCount,
    };
  }, [sales]);

  const listHeader = (
    <View style={styles.historyHeader}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.historyFilters}
      >
        {filters.map((item) => (
          <FilterChip
            key={item.value}
            label={item.label}
            selected={filter === item.value}
            onPress={() => onFilterChange(item.value)}
          />
        ))}
      </ScrollView>

      <View style={styles.statsGrid}>
        <View style={[styles.statCard, styles.statCardHero]}>
          <Text style={styles.statLabel}>{t('sales.periodSales')}</Text>
          {loading ? (
            <Skeleton height={28} style={styles.statSkel} />
          ) : (
            <MoneyText amount={stats.total} size={22} weight="800" color={colors.white} />
          )}
          <Text style={styles.statHint}>
            {loading ? '—' : `${stats.count} ${t('sales.periodCount').toLowerCase()}`}
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabelDark}>{t('sales.periodCount')}</Text>
          {loading ? (
            <Skeleton height={22} style={styles.statSkel} />
          ) : (
            <Text style={styles.statNumber}>{formatNumber(stats.count)}</Text>
          )}
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabelDark}>{t('sales.periodAverage')}</Text>
          {loading ? (
            <Skeleton height={22} style={styles.statSkel} />
          ) : (
            <MoneyText amount={stats.average} size={16} weight="800" color={colors.ink} />
          )}
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabelDark}>{t('sales.periodCredit')}</Text>
          {loading ? (
            <Skeleton height={22} style={styles.statSkel} />
          ) : (
            <MoneyText amount={stats.credit} size={16} weight="800" color={stats.credit > 0 ? colors.warningText : colors.ink} />
          )}
        </View>
        {stats.voidedCount > 0 ? (
          <View style={[styles.statCard, styles.statCardWide]}>
            <Text style={styles.statLabelDark}>{t('sales.periodVoided')}</Text>
            <Text style={styles.statNumberMuted}>{formatNumber(stats.voidedCount)}</Text>
          </View>
        ) : null}
      </View>

      {!loading && sales.length > 0 ? (
        <Text style={styles.historyListTitle}>{t('sales.salesHistory')}</Text>
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.flex}>
        <View style={styles.list}>
          {listHeader}
          <Skeleton height={76} style={styles.skel} />
          <Skeleton height={76} style={styles.skel} />
          <Skeleton height={76} style={styles.skel} />
        </View>
      </View>
    );
  }

  if (sales.length === 0) {
    return (
      <View style={styles.flex}>
        <View style={styles.list}>
          {listHeader}
          <EmptyState
            icon="receipt-outline"
            title={t('dashboard.noSalesYet')}
            message={t('sales.noSalesInFilter')}
          />
        </View>
      </View>
    );
  }

  return (
    <FlatList
      data={sales}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={listHeader}
      renderItem={({ item }) => (
        <SaleHistoryRow
          sale={item}
          customerName={customerNameOf(item.customer_id)}
          productNameOf={productNameOf}
          showDate={showDate}
          expanded={expandedId === item.id}
          onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
          onVoid={() => setPendingVoidId(item.id)}
        />
      )}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListFooterComponent={
        <ConfirmModal
          visible={pendingVoidId != null}
          onClose={() => setPendingVoidId(null)}
          onConfirm={() => {
            if (!pendingVoidId) return;
            const saleId = pendingVoidId;
            setPendingVoidId(null);
            onVoid(saleId);
          }}
          title={t('sales.voidSaleTitle')}
          message={t('sales.voidSaleMessage')}
          confirmText={t('sales.voidSale')}
          loading={voiding}
        />
      }
    />
  );
}

function paymentStatusLabel(status: string, t: (key: string) => string): string {
  if (status === 'paid') return t('sales.paid');
  if (status === 'partial') return t('sales.partial');
  if (status === 'unpaid') return t('sales.unpaid');
  if (status === 'credit') return t('sales.credit');
  return status;
}

function SaleHistoryRow({
  sale,
  customerName,
  productNameOf,
  showDate,
  expanded,
  onToggle,
  onVoid,
}: {
  sale: HistorySale;
  customerName: string;
  productNameOf: (id: string) => string;
  showDate: boolean;
  expanded: boolean;
  onToggle: () => void;
  onVoid: () => void;
}) {
  const { t } = useTranslation();
  const { data: items } = useSaleItems(expanded ? sale.id : null);
  const voided = sale.voided === true;
  const tone = voided
    ? 'neutral'
    : sale.payment_status === 'paid'
      ? 'success'
      : sale.payment_status === 'credit' || sale.payment_status === 'partial' || sale.payment_status === 'unpaid'
        ? 'warning'
        : 'neutral';
  const statusLabel = voided ? t('sales.voided') : paymentStatusLabel(sale.payment_status, t);
  return (
    <TouchableOpacity
      style={[styles.historyCard, voided && styles.historyCardVoided, expanded && styles.historyCardExpanded]}
      onPress={onToggle}
      activeOpacity={0.85}
    >
      <View style={styles.historyTop}>
        <View style={[styles.historyIcon, voided && styles.historyIconVoided]}>
          <Ionicons
            name={voided ? 'close-circle-outline' : 'receipt-outline'}
            size={18}
            color={voided ? colors.muted : colors.primary}
          />
        </View>
        <View style={styles.historyInfo}>
          <Text style={[styles.historyRef, voided && styles.historyRefVoided]} numberOfLines={1}>
            {sale.reference_number ?? sale.id.slice(0, 8).toUpperCase()}
          </Text>
          <Text style={styles.historySub} numberOfLines={1}>
            {customerName} · {formatRecordDateTime(sale.created_at || sale.sale_date)}
          </Text>
          {sale.notes ? (
            <Text style={[styles.historySub, { fontStyle: 'italic', color: colors.body }]} numberOfLines={1}>
              📝 {sale.notes}
            </Text>
          ) : null}
        </View>
        <View style={styles.historyRight}>
          <MoneyText
            amount={sale.total_amount}
            size={16}
            weight="800"
            color={voided ? colors.muted : colors.ink}
          />
          <StatusBadge label={statusLabel} tone={tone} />
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.faint} />
      </View>
      {expanded ? (
        <View style={styles.historyItems}>
          {(items ?? []).map((it) => (
            <View key={it.id} style={styles.historyItem}>
              <Text style={styles.historyItemName} numberOfLines={1}>
                {productNameOf(it.product_id)}
              </Text>
              <Text style={styles.historyItemQty}>×{it.quantity}</Text>
              <Text style={styles.historyItemTotal}>{it.total_amount.toLocaleString()} RWF</Text>
            </View>
          ))}
          {(items ?? []).length === 0 ? (
            <Text style={styles.historySub}>—</Text>
          ) : null}
          {voided ? null : (
            <TouchableOpacity onPress={onVoid} style={styles.voidButton} activeOpacity={0.8}>
              <Text style={styles.voidButtonText}>{t('sales.voidSale')}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
    flexGrow: 1,
  },
  skel: {
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  historyHeader: {
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  historyFilters: {
    paddingBottom: 2,
    gap: spacing.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
    ...shadows.card,
  },
  statCardHero: {
    width: '100%',
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statCardWide: {
    width: '100%',
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 0.2,
  },
  statLabelDark: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: 0.2,
  },
  statHint: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  statNumberMuted: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  statSkel: {
    borderRadius: radius.sm,
    marginTop: 4,
  },
  historyListTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.muted,
    marginTop: spacing.xs,
  },
  historyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  historyCardExpanded: {
    borderColor: colors.primary,
  },
  historyCardVoided: {
    opacity: 0.72,
    backgroundColor: colors.inputBg,
  },
  historyTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyIconVoided: {
    backgroundColor: colors.borderSoft,
  },
  historyInfo: {
    flex: 1,
    minWidth: 0,
  },
  historyRef: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  historyRefVoided: {
    textDecorationLine: 'line-through',
    color: colors.muted,
  },
  historySub: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 2,
  },
  historyRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  historyItems: {
    marginTop: spacing.md,
    marginLeft: 48,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: 6,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  historyItemName: {
    flex: 1,
    fontSize: 15,
    color: colors.ink,
    fontWeight: '600',
  },
  historyItemQty: {
    fontSize: 15,
    color: colors.body,
  },
  historyItemTotal: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  voidButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSoft,
  },
  voidButtonText: {
    color: colors.dangerText,
    fontSize: 15,
    fontWeight: '700',
  },
});

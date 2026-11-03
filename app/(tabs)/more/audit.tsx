import React from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { useRecentAudit } from '@/hooks/useData';
import { useAuthStore } from '@/stores/authStore';
import { canSeeProfit } from '@/utils/permissions';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const ACTION_META: Record<string, { icon: IoniconName; color: string; label: string }> = {
  'sale.create':             { icon: 'cart',            color: '#16a34a', label: 'New Sale' },
  'sale.void':               { icon: 'close-circle',    color: '#dc2626', label: 'Sale Voided' },
  'purchase.create':         { icon: 'cube',            color: '#0284c7', label: 'Stock Purchased' },
  'purchase.void':           { icon: 'close-circle',    color: '#dc2626', label: 'Purchase Voided' },
  'stock.adjust':            { icon: 'swap-vertical',   color: '#7c3aed', label: 'Stock Adjusted' },
  'stock.damage':            { icon: 'warning',         color: '#b45309', label: 'Damaged Stock' },
  'stock.count':             { icon: 'list',            color: '#0284c7', label: 'Stock Count' },
  'payment.customer':        { icon: 'cash',            color: '#16a34a', label: 'Customer Payment' },
  'payment.supplier':        { icon: 'card',            color: '#0284c7', label: 'Supplier Payment' },
  'expense.create':          { icon: 'wallet',          color: '#b45309', label: 'Expense Recorded' },
  'day.open':                { icon: 'sunny',           color: '#0284c7', label: 'Day Opened' },
  'day.close':               { icon: 'moon',            color: '#7c3aed', label: 'Day Closed' },
  'price.below_cost_override': { icon: 'alert-circle', color: '#dc2626', label: 'Below-Cost Sale Approved' },
  'credit_limit.override':   { icon: 'person',         color: '#b45309', label: 'Credit Limit Override' },
  'history.correction':      { icon: 'pencil',         color: '#475569', label: 'History Corrected' },
  'session.abandon_local':   { icon: 'trash',          color: '#dc2626', label: 'Session Abandoned' },
};

function getActionMeta(action: string) {
  return ACTION_META[action] ?? { icon: 'time-outline' as IoniconName, color: colors.primary, label: action.replace(/[_.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) };
}

function formatDateTime(value: unknown): string {
  const d = new Date(String(value ?? ''));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-RW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function humanize(value: unknown): string {
  return String(value ?? '—')
    .replace(/[_.]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getInitial(name: string): string {
  return (name || '?').charAt(0).toUpperCase();
}

export default function AuditScreen() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { data, isLoading, refetch, isRefetching } = useRecentAudit(100);

  if (!canSeeProfit(user?.role)) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="lock-closed" title={t('cash.noPermission')} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={(data ?? []) as Array<Record<string, unknown>>}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={!!isRefetching} onRefresh={() => refetch()} />}
        ListHeaderComponent={
          <View style={styles.headerBox}>
            <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
            <Text style={styles.hint}>{t('settings.auditHint')}</Text>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <>
              <Skeleton height={80} style={styles.skeleton} />
              <Skeleton height={80} style={styles.skeleton} />
              <Skeleton height={80} style={styles.skeleton} />
            </>
          ) : (
            <EmptyState icon="list-outline" title={t('settings.auditEmpty')} />
          )
        }
        renderItem={({ item }) => {
          const meta = getActionMeta(String(item.action ?? ''));
          const userName = String(item.user_name ?? '');
          const role = String(item.role ?? '');
          const entity = String(item.entity ?? '');
          const entityId = String(item.entity_id ?? '');
          const reason = item.reason ? String(item.reason) : null;

          return (
            <View style={styles.card}>
              {/* Action icon */}
              <View style={[styles.iconBox, { backgroundColor: meta.color + '18' }]}>
                <Ionicons name={meta.icon} size={20} color={meta.color} />
              </View>

              <View style={styles.body}>
                {/* Action label */}
                <Text style={styles.action}>{meta.label}</Text>

                {/* Entity info */}
                <View style={styles.metaRow}>
                  <Ionicons name="layers-outline" size={12} color={colors.muted} />
                  <Text style={styles.metaText} numberOfLines={1}>
                    {humanize(entity)}
                    {entityId ? ` · #${entityId.slice(0, 8)}` : ''}
                  </Text>
                </View>

                {/* User / Waiter who performed the action */}
                {userName ? (
                  <View style={styles.metaRow}>
                    <Ionicons name="person-outline" size={12} color={colors.muted} />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {userName}
                      {role ? ` (${role})` : ''}
                    </Text>
                  </View>
                ) : null}

                {/* Notes / reason */}
                {reason ? (
                  <View style={styles.reasonBox}>
                    <Ionicons name="chatbubble-outline" size={11} color={colors.body} />
                    <Text style={styles.reasonText} numberOfLines={2}>{reason}</Text>
                  </View>
                ) : null}
              </View>

              {/* Right side: time + user avatar */}
              <View style={styles.right}>
                <Text style={styles.time}>{formatDateTime(item.created_at)}</Text>
                {userName ? (
                  <View style={[styles.avatar, { backgroundColor: meta.color + '28' }]}>
                    <Text style={[styles.avatarText, { color: meta.color }]}>{getInitial(userName)}</Text>
                  </View>
                ) : (
                  <View style={styles.avatar}>
                    <Ionicons name="person" size={13} color={colors.muted} />
                  </View>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: 48,
  },
  skeleton: {
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
  },
  headerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  hint: {
    flex: 1,
    fontSize: 13,
    color: colors.primaryText,
    lineHeight: 18,
    fontWeight: '500',
  },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  action: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: colors.muted,
    flex: 1,
  },
  reasonBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginTop: 4,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  reasonText: {
    fontSize: 12,
    color: colors.body,
    flex: 1,
    lineHeight: 17,
  },
  right: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 0,
  },
  time: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '600',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '800',
  },
});

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

function humanize(value: unknown): string {
  return String(value ?? '—')
    .replace(/[_.]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(value: unknown): string {
  const d = new Date(String(value ?? ''));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-RW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
          <Text style={styles.hint}>{t('settings.auditHint')}</Text>
        }
        ListEmptyComponent={
          isLoading ? (
            <Skeleton height={72} />
          ) : (
            <EmptyState icon="list-outline" title={t('settings.auditEmpty')} />
          )
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.icon}>
              <Ionicons name="time-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.info}>
              <Text style={styles.action} numberOfLines={1}>
                {humanize(item.action)}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {humanize(item.entity)}
                {item.entity_id ? ` · ${String(item.entity_id).slice(0, 8)}` : ''}
              </Text>
              {item.reason ? (
                <Text style={styles.reason} numberOfLines={2}>
                  {String(item.reason)}
                </Text>
              ) : null}
            </View>
            <View style={styles.right}>
              <Text style={styles.time}>{formatTime(item.created_at)}</Text>
              {item.role ? <Text style={styles.role}>{String(item.role)}</Text> : null}
            </View>
          </View>
        )}
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
  hint: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: spacing.md,
    lineHeight: 18,
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
  icon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  action: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  meta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  reason: {
    fontSize: 12,
    color: colors.body,
    marginTop: 4,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
  },
  time: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '600',
  },
  role: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primaryText,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
});

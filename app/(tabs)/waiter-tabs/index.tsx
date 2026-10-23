import React from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { MoneyText } from '@/components/MoneyText';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { useWaiterTabs, useOpenDailyClosing } from '@/hooks/useData';
import { WaiterTabStatus } from '@/types';
import { showToast } from '@/stores/toastStore';

const statusTone: Record<WaiterTabStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  draft: 'info',
  partial: 'warning',
  paid: 'success',
  debt: 'danger',
  cancelled: 'neutral',
};

export default function WaiterTabsScreen() {
  const { t } = useTranslation();
  const { data, isLoading, refetch, isRefetching } = useWaiterTabs();
  const openDay = useOpenDailyClosing();
  const rows = data ?? [];

  const statusLabel = (status: WaiterTabStatus) => {
    const map: Record<WaiterTabStatus, string> = {
      draft: t('waiterTabs.statusDraft'),
      partial: t('waiterTabs.statusPartial'),
      paid: t('waiterTabs.statusPaid'),
      debt: t('waiterTabs.statusDebt'),
      cancelled: t('waiterTabs.statusCancelled'),
    };
    return map[status];
  };

  const onIssue = () => {
    if (!openDay.data) {
      showToast(t('waiterTabs.openSessionRequired'), 'warning');
      return;
    }
    router.push('/waiter-tabs/issue');
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('waiterTabs.title')} />
      {isLoading ? (
        <View style={styles.pad}>
          <Skeleton height={72} />
          <Skeleton height={72} style={{ marginTop: spacing.sm }} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={rows.length === 0 ? styles.emptyWrap : styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="people-circle-outline"
              title={t('waiterTabs.empty')}
              message={t('waiterTabs.emptyHint')}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.75}
              onPress={() => router.push(`/waiter-tabs/${item.id}`)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.waiterName} numberOfLines={1}>
                  {item.waiter_name ?? '—'}
                </Text>
                <StatusBadge label={statusLabel(item.status)} tone={statusTone[item.status]} />
              </View>
              <View style={styles.cardBottom}>
                <View>
                  <Text style={styles.meta}>{t('waiterTabs.balanceDue')}</Text>
                  <MoneyText
                    amount={item.balance_due ?? 0}
                    size={15}
                    weight="800"
                    color={colors.ink}
                  />
                </View>
                {(item.paid_amount ?? 0) > 0 ? (
                  <View style={styles.paidBlock}>
                    <Text style={styles.meta}>{t('waiterTabs.paidSoFar')}</Text>
                    <MoneyText
                      amount={item.paid_amount ?? 0}
                      size={12}
                      weight="600"
                      color={colors.body}
                    />
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={20} color={colors.faint} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
      <FloatingActionButton
        actions={[
          {
            label: t('waiterTabs.issue'),
            icon: 'add',
            onPress: onIssue,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  pad: { padding: spacing.md },
  list: { padding: spacing.md, paddingBottom: 100 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  waiterName: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.ink },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  paidBlock: { alignItems: 'flex-end', flex: 1 },
  meta: { fontSize: 10, fontWeight: '600', color: colors.faint, marginBottom: 2 },
});

import React from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { MoneyText } from '@/components/MoneyText';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useCustomersWithBalances } from '@/hooks/useData';

export default function CustomersScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch, isRefetching } = useCustomersWithBalances();
  const [refreshing, setRefreshing] = React.useState(false);

  const rows = data?.rows ?? [];

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('customers.customers')} />

      <FlatList
        data={rows}
        keyExtractor={(item) => item.customer.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing || !!isRefetching} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>{t('customers.totalOutstanding')}</Text>
            {isLoading ? (
              <Skeleton height={36} />
            ) : (
              <MoneyText amount={data?.totalOutstanding ?? 0} size={32} weight="800" color={colors.ink} />
            )}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View>
              <Skeleton height={68} style={styles.skel} />
              <Skeleton height={68} style={styles.skel} />
            </View>
          ) : (
            <EmptyState
              icon="people-outline"
              title={t('common.noCustomers')}
              message={t('customers.allSettled')}
            />
          )
        }
        renderItem={({ item }) => {
          const tone = item.outstanding <= 0 ? 'success' : item.paid > 0 ? 'warning' : 'danger';
          const label =
            item.outstanding <= 0
              ? t('customers.paid')
              : item.paid > 0
                ? t('customers.partial')
                : t('customers.outstanding');
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() =>
                router.push({ pathname: '/payment/customer-payment', params: { customerId: item.customer.id } } as any)
              }
              activeOpacity={0.8}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.customer.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>{item.customer.name}</Text>
                {item.customer.phone ? <Text style={styles.phone}>{item.customer.phone}</Text> : null}
              </View>
              <View style={styles.right}>
                <MoneyText amount={item.outstanding} size={16} weight="800" color={colors.ink} />
                <StatusBadge label={label} tone={tone} />
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.faint} />
            </TouchableOpacity>
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
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 110,
  },
  hero: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.muted,
    marginBottom: 4,
  },
  skel: {
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  phone: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
  },
});

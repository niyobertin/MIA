import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '@/theme/tokens';
import { MoneyText } from '@/components/MoneyText';
import { StatusBadge } from '@/components/StatusBadge';
import { Skeleton } from '@/components/Skeleton';
import { formatRecordDateTime } from '@/utils/formatters';
import { homeCard } from './styles';

type RecentSale = {
  id: string;
  reference_number?: string | null;
  created_by: string;
  created_at: string;
  total_amount: number;
  payment_status: string;
  voided?: boolean;
  items?: unknown[];
};

export function RecentSalesCard({
  sales,
  loading,
  userMap,
  onOpen,
}: {
  sales: RecentSale[];
  loading: boolean;
  userMap: Map<string, string>;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const recent = sales.filter((sale) => !sale.voided).slice(0, 8);
  return (
    <View style={homeCard.card}>
      <View style={[homeCard.header, styles.header]}>
        <Text style={homeCard.title}>{t('dashboard.recentTransactions')}</Text>
        <TouchableOpacity onPress={onOpen} hitSlop={8}>
          <Text style={homeCard.link}>{t('dashboard.viewAll')}</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <Skeleton height={52} />
      ) : recent.length === 0 ? (
        <Text style={homeCard.muted}>{t('dashboard.noSalesYet')}</Text>
      ) : (
        recent.map((sale) => {
          const sellerName = userMap.get(sale.created_by);
          const itemCount = sale.items?.length ?? 0;
          return (
            <TouchableOpacity key={sale.id} style={styles.row} onPress={onOpen} activeOpacity={0.7}>
              <View style={styles.avatar}>
                <Ionicons name="receipt-outline" size={18} color={colors.primary} />
              </View>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>
                  {sale.reference_number
                    ? `#${sale.reference_number}`
                    : sellerName
                      ? `${t('dashboard.by')} ${sellerName}`
                      : t('sales.saleDetails')}
                </Text>
                <Text style={styles.detail} numberOfLines={1}>
                  {formatRecordDateTime(sale.created_at)}
                  {itemCount > 0 ? ` · ${itemCount} ${t('sales.items')}` : ''}
                </Text>
              </View>
              <View style={styles.right}>
                <MoneyText amount={sale.total_amount} size={15} weight="700" />
                <StatusBadge
                  label={t(`sales.${sale.payment_status}` as 'sales.paid')}
                  tone={sale.payment_status === 'paid' ? 'success' : sale.payment_status === 'credit' ? 'warning' : 'neutral'}
                />
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  detail: { fontSize: 13, color: colors.muted, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
});

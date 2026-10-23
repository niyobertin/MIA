import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { Button } from '@/components/Button';
import { MoneyText } from '@/components/MoneyText';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState } from '@/components/EmptyState';
import { BottomSheet } from '@/components/SegmentedControl';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showToast } from '@/stores/toastStore';
import {
  useProducts,
  useBusinessUsers,
  useIssueWaiterTab,
  useOpenDailyClosing,
} from '@/hooks/useData';
import { User } from '@/types';

type Line = { productId: string; name: string; quantity: number; sellingPrice: number };

export default function IssueWaiterTabScreen() {
  const { t } = useTranslation();
  const { data: products } = useProducts({ active: true });
  const { data: users } = useBusinessUsers();
  const issueMutation = useIssueWaiterTab();
  const openDay = useOpenDailyClosing();

  const waiters = (users ?? []).filter(
    (u) => u.active && (u.role === 'STAFF' || u.role === 'CASHIER')
  );

  const [waiter, setWaiter] = React.useState<User | null>(null);
  const [showWaiters, setShowWaiters] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [lines, setLines] = React.useState<Line[]>([]);
  const [notes, setNotes] = React.useState('');
  const [confirm, setConfirm] = React.useState(false);

  const filtered = React.useMemo(() => {
    const list = products ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q)
    );
  }, [products, search]);

  const total = lines.reduce((s, l) => s + l.quantity * l.sellingPrice, 0);

  const addProduct = (product: { id: string; name: string; selling_price: number }) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          quantity: 1,
          sellingPrice: product.selling_price,
        },
      ];
    });
  };

  const bump = (productId: string, delta: number) => {
    setLines((prev) =>
      prev
        .map((l) =>
          l.productId === productId ? { ...l, quantity: l.quantity + delta } : l
        )
        .filter((l) => l.quantity > 0)
    );
  };

  const doIssue = async () => {
    if (!openDay.data) {
      showToast(t('waiterTabs.openSessionRequired'), 'warning');
      return;
    }
    if (!waiter || lines.length === 0) return;
    try {
      const tab = await issueMutation.mutateAsync({
        waiterUserId: waiter.id,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          sellingPrice: l.sellingPrice,
        })),
        notes: notes.trim() || undefined,
      });
      setConfirm(false);
      showToast(t('waiterTabs.issued'), 'success');
      router.replace(`/waiter-tabs/${tab.id}`);
    } catch {
      setConfirm(false);
      showToast(t('waiterTabs.issueFailed'), 'error');
    }
  };

  return (
    <View style={styles.screen}>
      <TouchableOpacity
        style={styles.waiterRow}
        onPress={() => setShowWaiters(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="person-circle-outline" size={28} color={colors.primary} />
        <View style={styles.waiterInfo}>
          <Text style={styles.waiterLabel}>{t('waiterTabs.selectWaiter')}</Text>
          <Text style={styles.waiterName}>
            {waiter ? waiter.name : t('waiterTabs.selectWaiter')}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.faint} />
      </TouchableOpacity>

      <View style={styles.searchWrap}>
        <SearchBar value={search} onChangeText={setSearch} placeholder={t('common.search')} />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState icon="cube-outline" title={t('common.noResults')} />
        }
        renderItem={({ item }) => {
          const inCart = lines.find((l) => l.productId === item.id);
          return (
            <TouchableOpacity
              style={styles.productRow}
              onPress={() => addProduct(item)}
              activeOpacity={0.75}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.productName}>{item.name}</Text>
                <MoneyText amount={item.selling_price} size={13} color={colors.body} />
              </View>
              {inCart ? (
                <View style={styles.qtyControls}>
                  <TouchableOpacity onPress={() => bump(item.id, -1)} hitSlop={8}>
                    <Ionicons name="remove-circle" size={28} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.qty}>{inCart.quantity}</Text>
                  <TouchableOpacity onPress={() => bump(item.id, 1)} hitSlop={8}>
                    <Ionicons name="add-circle" size={28} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              ) : (
                <Ionicons name="add-circle-outline" size={28} color={colors.faint} />
              )}
            </TouchableOpacity>
          );
        }}
      />

      <View style={styles.footer}>
        <TextInput
          style={styles.notes}
          placeholder={t('waiterTabs.notes')}
          placeholderTextColor={colors.faint}
          value={notes}
          onChangeText={setNotes}
        />
        <View style={styles.footerRow}>
          <MoneyText amount={total} size={16} weight="800" color={colors.ink} />
          <Button
            title={t('waiterTabs.issueStock')}
            onPress={() => setConfirm(true)}
            disabled={!waiter || lines.length === 0 || issueMutation.isPending}
            loading={issueMutation.isPending}
          />
        </View>
      </View>

      <BottomSheet
        visible={showWaiters}
        onClose={() => setShowWaiters(false)}
        title={t('waiterTabs.selectWaiter')}
      >
        {waiters.length === 0 ? (
          <Text style={styles.emptyWaiters}>{t('waiterTabs.noWaiters')}</Text>
        ) : (
          waiters.map((u) => (
            <TouchableOpacity
              key={u.id}
              style={styles.waiterOption}
              onPress={() => {
                setWaiter(u);
                setShowWaiters(false);
              }}
            >
              <Text style={styles.waiterOptionName}>{u.name}</Text>
              <Text style={styles.waiterOptionRole}>
                {u.role ? t(`users.${u.role.toLowerCase()}` as any) : ''}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </BottomSheet>

      <ConfirmModal
        visible={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => void doIssue()}
        title={t('waiterTabs.issue')}
        message={`${waiter?.name ?? ''} · ${lines.length} ${t('waiterTabs.product').toLowerCase()}`}
        confirmText={t('common.confirm')}
        variant="primary"
        loading={issueMutation.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  waiterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    ...shadows.card,
  },
  waiterInfo: { flex: 1 },
  waiterLabel: { fontSize: 10, fontWeight: '600', color: colors.faint },
  waiterName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  searchWrap: { paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  list: { paddingHorizontal: spacing.md, paddingBottom: 160 },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  productName: { fontSize: 13, fontWeight: '600', color: colors.ink },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  qty: { minWidth: 22, textAlign: 'center', fontWeight: '700', fontSize: 13, color: colors.ink },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  notes: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: 13,
    color: colors.ink,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  emptyWaiters: { padding: spacing.md, color: colors.body, textAlign: 'center', fontSize: 13 },
  waiterOption: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  waiterOptionName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  waiterOptionRole: { fontSize: 11, color: colors.faint, marginTop: 2 },
});

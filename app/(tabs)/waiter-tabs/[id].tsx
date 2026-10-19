import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Picker } from '@react-native-picker/picker';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { Button } from '@/components/Button';
import { MoneyText } from '@/components/MoneyText';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmModal } from '@/components/ConfirmModal';
import { BottomSheet } from '@/components/SegmentedControl';
import { SearchBar } from '@/components/SearchBar';
import { showToast } from '@/stores/toastStore';
import {
  useWaiterTab,
  useRecordWaiterPayment,
  useAddWaiterTabItems,
  useReturnWaiterTabItems,
  useReturnPaidWaiterTab,
  useProducts,
} from '@/hooks/useData';
import { PAYMENT_METHODS } from '@/constants';
import { WaiterTabStatus } from '@/types';

const PAY_METHODS = PAYMENT_METHODS.filter((p) => p.value !== 'credit');

const statusTone: Record<WaiterTabStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  draft: 'info',
  partial: 'warning',
  paid: 'success',
  debt: 'danger',
  cancelled: 'neutral',
};

export default function WaiterTabDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: tab, refetch, isRefetching } = useWaiterTab(id ?? null);
  const { data: products } = useProducts({ active: true });
  const payMutation = useRecordWaiterPayment();
  const addMutation = useAddWaiterTabItems();
  const returnMutation = useReturnWaiterTabItems();
  const returnPaidMutation = useReturnPaidWaiterTab();

  const [amountText, setAmountText] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState<'cash' | 'mobile_money' | 'bank'>('cash');
  const [showPayConfirm, setShowPayConfirm] = React.useState(false);
  const [showAdd, setShowAdd] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [addLines, setAddLines] = React.useState<
    Array<{ productId: string; quantity: number; sellingPrice: number; name: string }>
  >([]);
  const [returnQtys, setReturnQtys] = React.useState<Record<string, number>>({});
  const [showReturnConfirm, setShowReturnConfirm] = React.useState(false);
  const [returnReason, setReturnReason] = React.useState('');
  const [showReturnPaid, setShowReturnPaid] = React.useState(false);

  const balanceDue = tab?.balance_due ?? 0;
  const canPay =
    tab && (tab.status === 'draft' || tab.status === 'partial' || tab.status === 'debt') && balanceDue > 0;
  const canAdd = tab && (tab.status === 'draft' || tab.status === 'partial');
  const canReturnItems = tab && (tab.status === 'draft' || tab.status === 'partial' || tab.status === 'debt');
  const canReturnPaid = tab && (tab.status === 'paid' || tab.status === 'debt');

  React.useEffect(() => {
    if (balanceDue > 0) {
      setAmountText(String(balanceDue));
    }
  }, [balanceDue, tab?.id]);

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

  const parseAmount = () => {
    const n = parseInt(amountText.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  };

  const doPay = async () => {
    if (!tab) return;
    const amount = parseAmount();
    if (amount < 1) {
      showToast(t('errors.invalidAmount'), 'warning');
      return;
    }
    if (amount > balanceDue) {
      showToast(t('waiterTabs.overpayment'), 'warning');
      return;
    }
    try {
      await payMutation.mutateAsync({
        tabId: tab.id,
        amount,
        paymentMethod,
      });
      setShowPayConfirm(false);
      showToast(t('waiterTabs.paymentRecorded'), 'success');
      refetch();
    } catch (error) {
      setShowPayConfirm(false);
      const code = error instanceof Error ? error.message : '';
      if (code === 'OVERPAYMENT') showToast(t('waiterTabs.overpayment'), 'error');
      else showToast(t('waiterTabs.paymentFailed'), 'error');
    }
  };

  const doAdd = async () => {
    if (!tab || addLines.length === 0) return;
    try {
      await addMutation.mutateAsync({
        tabId: tab.id,
        lines: addLines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          sellingPrice: l.sellingPrice,
        })),
      });
      setShowAdd(false);
      setAddLines([]);
      showToast(t('waiterTabs.itemsAdded'), 'success');
      refetch();
    } catch {
      showToast(t('waiterTabs.issueFailed'), 'error');
    }
  };

  const doReturn = async () => {
    if (!tab) return;
    const returns = Object.entries(returnQtys)
      .filter(([, q]) => q > 0)
      .map(([itemId, quantity]) => ({ itemId, quantity }));
    if (returns.length === 0) return;
    try {
      await returnMutation.mutateAsync({
        tabId: tab.id,
        returns,
        reason: returnReason.trim() || undefined,
      });
      setShowReturnConfirm(false);
      setReturnQtys({});
      showToast(t('waiterTabs.itemsReturned'), 'success');
      refetch();
    } catch {
      showToast(t('waiterTabs.returnFailed'), 'error');
    }
  };

  const doReturnPaid = async () => {
    if (!tab || !returnReason.trim()) return;
    try {
      await returnPaidMutation.mutateAsync({
        tabId: tab.id,
        reason: returnReason.trim(),
      });
      setShowReturnPaid(false);
      showToast(t('waiterTabs.itemsReturned'), 'success');
      refetch();
    } catch {
      showToast(t('waiterTabs.returnFailed'), 'error');
    }
  };

  const filteredProducts = React.useMemo(() => {
    const list = products ?? [];
    if (!search.trim()) return list.slice(0, 40);
    const q = search.toLowerCase();
    return list
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [products, search]);

  if (!tab) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="alert-circle-outline" title={t('errors.notFound')} />
      </View>
    );
  }

  const items = tab.items ?? [];

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: tab.waiter_name ?? t('waiterTabs.title') }} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
        }
      >
        <View style={styles.summary}>
          <View style={styles.summaryTop}>
            <Text style={styles.waiterName}>{tab.waiter_name ?? '—'}</Text>
            <StatusBadge label={statusLabel(tab.status)} tone={statusTone[tab.status]} />
          </View>
          <View style={styles.moneyRow}>
            <View style={styles.moneyBlock}>
              <Text style={styles.meta}>{t('waiterTabs.total')}</Text>
              <MoneyText amount={tab.total_amount ?? 0} size={20} weight="800" />
            </View>
            <View style={styles.moneyBlock}>
              <Text style={styles.meta}>{t('waiterTabs.paidSoFar')}</Text>
              <MoneyText amount={tab.paid_amount ?? 0} size={20} weight="700" color={colors.body} />
            </View>
            <View style={styles.moneyBlock}>
              <Text style={styles.meta}>{t('waiterTabs.balanceDue')}</Text>
              <MoneyText amount={balanceDue} size={20} weight="800" color={colors.primary} />
            </View>
          </View>
        </View>

        <Text style={styles.section}>{t('waiterTabs.product')}</Text>
        {items.length === 0 ? (
          <Text style={styles.emptyItems}>{t('waiterTabs.noItems')}</Text>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.product_name ?? '—'}</Text>
                <Text style={styles.itemMeta}>
                  {item.quantity_outstanding} × {item.selling_price.toLocaleString()} RWF
                </Text>
              </View>
              <MoneyText
                amount={item.quantity_outstanding * item.selling_price}
                size={15}
                weight="700"
              />
              {canReturnItems && item.quantity_outstanding > 0 ? (
                <View style={styles.returnQty}>
                  <TouchableOpacity
                    onPress={() =>
                      setReturnQtys((prev) => ({
                        ...prev,
                        [item.id]: Math.max(0, (prev[item.id] ?? 0) - 1),
                      }))
                    }
                  >
                    <Ionicons name="remove-circle-outline" size={22} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.returnQtyText}>{returnQtys[item.id] ?? 0}</Text>
                  <TouchableOpacity
                    onPress={() =>
                      setReturnQtys((prev) => ({
                        ...prev,
                        [item.id]: Math.min(
                          item.quantity_outstanding,
                          (prev[item.id] ?? 0) + 1
                        ),
                      }))
                    }
                  >
                    <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ))
        )}

        {canPay ? (
          <View style={styles.payCard}>
            <Text style={styles.section}>{t('waiterTabs.recordPayment')}</Text>
            <Text style={styles.meta}>{t('waiterTabs.amountPaid')}</Text>
            <TextInput
              style={styles.amountInput}
              keyboardType="number-pad"
              value={amountText}
              onChangeText={setAmountText}
              placeholder={t('waiterTabs.amountPaidPlaceholder')}
              placeholderTextColor={colors.faint}
            />
            <TouchableOpacity
              style={styles.payFullBtn}
              onPress={() => setAmountText(String(balanceDue))}
            >
              <Text style={styles.payFullText}>{t('waiterTabs.payFull')}</Text>
            </TouchableOpacity>
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}
              >
                {PAY_METHODS.map((m) => (
                  <Picker.Item
                    key={m.value}
                    label={t(`common.${m.value === 'mobile_money' ? 'mobileMoney' : m.value}` as any)}
                    value={m.value}
                  />
                ))}
              </Picker>
            </View>
            <Button
              title={t('waiterTabs.recordPayment')}
              onPress={() => setShowPayConfirm(true)}
              loading={payMutation.isPending}
              disabled={payMutation.isPending}
            />
          </View>
        ) : null}

        <View style={styles.actions}>
          {canAdd ? (
            <Button
              title={t('waiterTabs.addItems')}
              variant="outline"
              onPress={() => setShowAdd(true)}
            />
          ) : null}
          {canReturnItems && Object.values(returnQtys).some((q) => q > 0) ? (
            <Button
              title={t('waiterTabs.returnItems')}
              variant="secondary"
              onPress={() => setShowReturnConfirm(true)}
            />
          ) : null}
          {canReturnPaid ? (
            <Button
              title={t('waiterTabs.returnAll')}
              variant="danger"
              onPress={() => setShowReturnPaid(true)}
            />
          ) : null}
        </View>
      </ScrollView>

      <BottomSheet
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        title={t('waiterTabs.addItems')}
      >
        <SearchBar value={search} onChangeText={setSearch} placeholder={t('common.search')} />
        <ScrollView style={{ maxHeight: 320 }}>
          {filteredProducts.map((p) => {
            const line = addLines.find((l) => l.productId === p.id);
            return (
              <TouchableOpacity
                key={p.id}
                style={styles.addProduct}
                onPress={() => {
                  setAddLines((prev) => {
                    const existing = prev.find((l) => l.productId === p.id);
                    if (existing) {
                      return prev.map((l) =>
                        l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l
                      );
                    }
                    return [
                      ...prev,
                      {
                        productId: p.id,
                        quantity: 1,
                        sellingPrice: p.selling_price,
                        name: p.name,
                      },
                    ];
                  });
                }}
              >
                <Text style={styles.itemName}>{p.name}</Text>
                <Text style={styles.itemMeta}>{line ? `×${line.quantity}` : '+'}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <Button
          title={t('waiterTabs.addItems')}
          onPress={() => void doAdd()}
          disabled={addLines.length === 0 || addMutation.isPending}
          loading={addMutation.isPending}
          style={{ marginTop: spacing.md }}
        />
      </BottomSheet>

      <ConfirmModal
        visible={showPayConfirm}
        onClose={() => setShowPayConfirm(false)}
        onConfirm={() => void doPay()}
        title={t('waiterTabs.confirmPayment')}
        message={t('waiterTabs.confirmPaymentMessage', {
          amount: `${parseAmount().toLocaleString()} RWF`,
        })}
        confirmText={t('common.confirm')}
        variant="primary"
        loading={payMutation.isPending}
      />

      <ConfirmModal
        visible={showReturnConfirm}
        onClose={() => setShowReturnConfirm(false)}
        onConfirm={() => void doReturn()}
        title={t('waiterTabs.confirmReturn')}
        message={t('waiterTabs.confirmReturnMessage')}
        confirmText={t('waiterTabs.returnItems')}
        variant="danger"
        loading={returnMutation.isPending}
      />

      <BottomSheet
        visible={showReturnPaid}
        onClose={() => setShowReturnPaid(false)}
        title={t('waiterTabs.returnAll')}
      >
        <Text style={styles.itemMeta}>{t('waiterTabs.confirmReturnMessage')}</Text>
        <TextInput
          style={styles.amountInput}
          placeholder={t('waiterTabs.returnReason')}
          placeholderTextColor={colors.faint}
          value={returnReason}
          onChangeText={setReturnReason}
        />
        <Button
          title={t('waiterTabs.returnAll')}
          variant="danger"
          onPress={() => void doReturnPaid()}
          disabled={!returnReason.trim() || returnPaidMutation.isPending}
          loading={returnPaidMutation.isPending}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  summary: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  waiterName: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.ink },
  moneyRow: { flexDirection: 'row', gap: spacing.sm },
  moneyBlock: { flex: 1 },
  meta: { fontSize: 11, fontWeight: '600', color: colors.faint, marginBottom: 4 },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.body,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  emptyItems: { color: colors.faint, marginBottom: spacing.md },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  itemMeta: { fontSize: 12, color: colors.faint, marginTop: 2 },
  returnQty: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  returnQtyText: { minWidth: 18, textAlign: 'center', fontWeight: '700' },
  payCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    ...shadows.card,
  },
  amountInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  payFullBtn: { alignSelf: 'flex-start', marginBottom: spacing.sm },
  payFullText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  pickerWrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
  addProduct: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});

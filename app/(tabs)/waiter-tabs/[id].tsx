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
  useAdjustWaiterTabItem,
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
  const adjustMutation = useAdjustWaiterTabItem();
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
  const [returnMode, setReturnMode] = React.useState(false);
  const [returnQtys, setReturnQtys] = React.useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = React.useState('');
  const [showReturnConfirm, setShowReturnConfirm] = React.useState(false);
  const [showReturnPaid, setShowReturnPaid] = React.useState(false);
  const [adjustingId, setAdjustingId] = React.useState<string | null>(null);
  const [highlightIds, setHighlightIds] = React.useState<Set<string>>(new Set());
  const amountTouched = React.useRef(false);

  const balanceDue = tab?.balance_due ?? 0;
  const canPay =
    tab && (tab.status === 'draft' || tab.status === 'partial' || tab.status === 'debt') && balanceDue > 0;
  const canEditQty = tab && (tab.status === 'draft' || tab.status === 'partial') && !returnMode;
  const canAdd = tab && (tab.status === 'draft' || tab.status === 'partial');
  const canReturn =
    tab &&
    (tab.status === 'draft' ||
      tab.status === 'partial' ||
      tab.status === 'debt' ||
      tab.status === 'paid');
  const canReturnPaid = tab && (tab.status === 'paid' || tab.status === 'debt');
  const selectedReturnCount = Object.values(returnQtys).reduce((s, q) => s + (q > 0 ? q : 0), 0);

  React.useEffect(() => {
    if (balanceDue > 0 && !amountTouched.current) {
      setAmountText(String(balanceDue));
    }
  }, [balanceDue, tab?.id]);

  React.useEffect(() => {
    amountTouched.current = false;
  }, [tab?.id]);

  const payAmount = React.useMemo(() => {
    const n = parseInt(amountText.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }, [amountText]);

  const remainingAfterPay = Math.max(0, balanceDue - payAmount);

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

  const bumpQty = async (itemId: string, delta: number) => {
    if (!tab) return;
    setAdjustingId(itemId);
    try {
      await adjustMutation.mutateAsync({ tabId: tab.id, itemId, delta });
      await refetch();
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'BELOW_PAID_AMOUNT') showToast(t('waiterTabs.belowPaid'), 'warning');
      else showToast(t('waiterTabs.qtyFailed'), 'error');
    } finally {
      setAdjustingId(null);
    }
  };

  const doPay = async () => {
    if (!tab) return;
    if (payAmount < 1) {
      showToast(t('errors.invalidAmount'), 'warning');
      return;
    }
    if (payAmount > balanceDue) {
      showToast(t('waiterTabs.overpayment'), 'warning');
      return;
    }
    try {
      await payMutation.mutateAsync({
        tabId: tab.id,
        amount: payAmount,
        paymentMethod,
      });
      setShowPayConfirm(false);
      amountTouched.current = false;
      showToast(t('waiterTabs.paymentRecorded'), 'success');
      refetch();
    } catch (error) {
      setShowPayConfirm(false);
      const code = error instanceof Error ? error.message : '';
      if (code === 'OVERPAYMENT') showToast(t('waiterTabs.overpayment'), 'error');
      else if (code === 'DAY_CLOSED') showToast(t('waiterTabs.openSessionRequired'), 'warning');
      else showToast(t('waiterTabs.paymentFailed'), 'error');
    }
  };

  const doAdd = async () => {
    if (!tab || addLines.length === 0) return;
    const productIds = new Set(addLines.map((l) => l.productId));
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
      setSearch('');
      showToast(t('waiterTabs.itemsAdded'), 'success');
      const refreshed = await refetch();
      const nextItems = refreshed.data?.items ?? [];
      const newly = new Set(
        nextItems.filter((i) => productIds.has(i.product_id) && i.quantity_outstanding > 0).map((i) => i.id)
      );
      setHighlightIds(newly);
      setTimeout(() => setHighlightIds(new Set()), 4000);
    } catch {
      showToast(t('waiterTabs.issueFailed'), 'error');
    }
  };

  const setReturnQty = (itemId: string, quantity: number, max: number) => {
    const next = Math.max(0, Math.min(max, quantity));
    setReturnQtys((prev) => {
      if (next < 1) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const doPartialReturn = async () => {
    if (!tab) return;
    const returns = Object.entries(returnQtys)
      .filter(([, q]) => q > 0)
      .map(([itemId, quantity]) => ({ itemId, quantity }));
    if (returns.length === 0) {
      showToast(t('waiterTabs.selectReturnQty'), 'warning');
      return;
    }
    try {
      await returnMutation.mutateAsync({
        tabId: tab.id,
        returns,
        reason: returnReason.trim() || undefined,
      });
      setShowReturnConfirm(false);
      setReturnMode(false);
      setReturnQtys({});
      setReturnReason('');
      showToast(t('waiterTabs.itemsReturned'), 'success');
      refetch();
    } catch (error) {
      setShowReturnConfirm(false);
      const code = error instanceof Error ? error.message : '';
      if (code === 'DAY_CLOSED') showToast(t('waiterTabs.openSessionRequired'), 'warning');
      else showToast(t('waiterTabs.returnFailed'), 'error');
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
      setReturnReason('');
      showToast(t('waiterTabs.itemsReturned'), 'success');
      refetch();
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'DAY_CLOSED') showToast(t('waiterTabs.openSessionRequired'), 'warning');
      else showToast(t('waiterTabs.returnFailed'), 'error');
    }
  };

  const setAddQty = (productId: string, quantity: number) => {
    setAddLines((prev) => {
      if (quantity < 1) return prev.filter((l) => l.productId !== productId);
      const existing = prev.find((l) => l.productId === productId);
      if (existing) {
        return prev.map((l) => (l.productId === productId ? { ...l, quantity } : l));
      }
      const product = products?.find((p) => p.id === productId);
      if (!product) return prev;
      return [
        ...prev,
        {
          productId,
          quantity,
          sellingPrice: product.selling_price,
          name: product.name,
        },
      ];
    });
  };

  const filteredProducts = React.useMemo(() => {
    const list = products ?? [];
    if (!search.trim()) return list.slice(0, 50);
    const q = search.toLowerCase();
    return list
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [products, search]);

  const addTotal = addLines.reduce((s, l) => s + l.quantity * l.sellingPrice, 0);

  if (!tab) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="alert-circle-outline" title={t('errors.notFound')} />
      </View>
    );
  }

  const items = (tab.items ?? []).filter((i) => i.quantity_outstanding > 0);

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
              <MoneyText amount={tab.total_amount ?? 0} size={15} weight="800" color={colors.ink} />
            </View>
            <View style={styles.moneyBlock}>
              <Text style={styles.meta}>{t('waiterTabs.paidSoFar')}</Text>
              <MoneyText amount={tab.paid_amount ?? 0} size={15} weight="700" color={colors.body} />
            </View>
            <View style={styles.moneyBlock}>
              <Text style={styles.meta}>{t('waiterTabs.balanceDue')}</Text>
              <MoneyText amount={balanceDue} size={15} weight="800" color={colors.primary} />
            </View>
          </View>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.section}>{t('waiterTabs.product')}</Text>
          {canReturn && items.length > 0 ? (
            <TouchableOpacity
              onPress={() => {
                setReturnMode((v) => !v);
                setReturnQtys({});
              }}
            >
              <Text style={styles.returnToggle}>
                {returnMode ? t('common.cancel') : t('waiterTabs.returnItems')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {returnMode ? (
          <Text style={styles.partialHint}>{t('waiterTabs.returnHint')}</Text>
        ) : null}
        {items.length === 0 ? (
          <Text style={styles.emptyItems}>{t('waiterTabs.noItems')}</Text>
        ) : (
          items.map((item) => {
            const highlighted = highlightIds.has(item.id);
            const busy = adjustingId === item.id && adjustMutation.isPending;
            const retQty = returnQtys[item.id] ?? 0;
            return (
              <View
                key={item.id}
                style={[
                  styles.itemCard,
                  highlighted ? styles.itemCardHighlight : null,
                  returnMode && retQty > 0 ? styles.itemCardReturn : null,
                ]}
              >
                <View style={styles.itemMain}>
                  <Text style={styles.itemName}>{item.product_name ?? '—'}</Text>
                  <Text style={styles.itemMeta}>
                    {item.selling_price.toLocaleString()} RWF · {t('waiterTabs.qty')}{' '}
                    {item.quantity_outstanding}
                  </Text>
                </View>
                <MoneyText
                  amount={item.quantity_outstanding * item.selling_price}
                  size={13}
                  weight="700"
                  color={colors.ink}
                />
                {returnMode ? (
                  <View style={styles.qtyControls}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => setReturnQty(item.id, retQty - 1, item.quantity_outstanding)}
                      hitSlop={8}
                    >
                      <Ionicons name="remove" size={20} color={colors.danger} />
                    </TouchableOpacity>
                    <Text style={styles.qtyValue}>{retQty}</Text>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => setReturnQty(item.id, retQty + 1, item.quantity_outstanding)}
                      hitSlop={8}
                    >
                      <Ionicons name="add" size={20} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                ) : canEditQty ? (
                  <View style={styles.qtyControls}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      disabled={busy || item.quantity_outstanding < 1}
                      onPress={() => void bumpQty(item.id, -1)}
                      hitSlop={8}
                      accessibilityLabel={t('sales.decreaseQty')}
                    >
                      <Ionicons name="remove" size={20} color={colors.primary} />
                    </TouchableOpacity>
                    <Text style={styles.qtyValue}>{item.quantity_outstanding}</Text>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      disabled={busy}
                      onPress={() => void bumpQty(item.id, 1)}
                      hitSlop={8}
                      accessibilityLabel={t('sales.increaseQty')}
                    >
                      <Ionicons name="add" size={20} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.qtyValue}>{item.quantity_outstanding}</Text>
                )}
              </View>
            );
          })
        )}

        {returnMode ? (
          <View style={styles.returnActions}>
            <TextInput
              style={styles.reasonInput}
              placeholder={t('waiterTabs.returnReason')}
              placeholderTextColor={colors.faint}
              value={returnReason}
              onChangeText={setReturnReason}
            />
            <Button
              title={`${t('waiterTabs.returnPartial')} (${selectedReturnCount})`}
              variant="danger"
              onPress={() => {
                if (selectedReturnCount < 1) {
                  showToast(t('waiterTabs.selectReturnQty'), 'warning');
                  return;
                }
                setShowReturnConfirm(true);
              }}
              disabled={returnMutation.isPending}
              loading={returnMutation.isPending}
            />
          </View>
        ) : null}

        {canPay ? (
          <View style={styles.payCard}>
            <Text style={styles.section}>{t('waiterTabs.recordPayment')}</Text>
            <Text style={styles.partialHint}>{t('waiterTabs.partialPayHint')}</Text>
            {tab.status === 'debt' ? (
              <Text style={styles.partialHint}>{t('waiterTabs.debtPayAnytime')}</Text>
            ) : null}
            <Text style={styles.meta}>{t('waiterTabs.amountPaid')}</Text>
            <TextInput
              style={styles.amountInput}
              keyboardType="number-pad"
              value={amountText}
              onChangeText={(text) => {
                amountTouched.current = true;
                setAmountText(text.replace(/[^\d]/g, ''));
              }}
              placeholder={t('waiterTabs.amountPaidPlaceholder')}
              placeholderTextColor={colors.faint}
            />
            <View style={styles.payMetaRow}>
              <TouchableOpacity
                style={styles.payFullBtn}
                onPress={() => {
                  amountTouched.current = true;
                  setAmountText(String(balanceDue));
                }}
              >
                <Text style={styles.payFullText}>{t('waiterTabs.payFull')}</Text>
              </TouchableOpacity>
              <View style={styles.remainingBox}>
                <Text style={styles.meta}>{t('waiterTabs.remainingUnpaid')}</Text>
                <MoneyText
                  amount={remainingAfterPay}
                  size={13}
                  weight="800"
                  color={remainingAfterPay > 0 ? colors.warningText : colors.successText}
                />
              </View>
            </View>
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
              disabled={payMutation.isPending || payAmount < 1}
            />
          </View>
        ) : null}

        {!returnMode ? (
          <View style={styles.actions}>
            {canAdd ? (
              <Button
                title={t('waiterTabs.addItems')}
                variant="outline"
                onPress={() => setShowAdd(true)}
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
        ) : null}
      </ScrollView>

      <BottomSheet
        visible={showAdd}
        onClose={() => {
          setShowAdd(false);
          setAddLines([]);
          setSearch('');
        }}
        title={t('waiterTabs.addItems')}
      >
        <SearchBar value={search} onChangeText={setSearch} placeholder={t('common.search')} />

        {addLines.length > 0 ? (
          <View style={styles.selectedBox}>
            <Text style={styles.selectedTitle}>
              {t('waiterTabs.selectedItems')} · {addLines.length}
            </Text>
            {addLines.map((line) => (
              <View key={line.productId} style={styles.selectedRow}>
                <Text style={styles.selectedName} numberOfLines={1}>
                  {line.name}
                </Text>
                <View style={styles.qtyControls}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => setAddQty(line.productId, line.quantity - 1)}
                  >
                    <Ionicons name="remove" size={18} color={colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.qtyValue}>{line.quantity}</Text>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => setAddQty(line.productId, line.quantity + 1)}
                  >
                    <Ionicons name="add" size={18} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <MoneyText amount={addTotal} size={14} weight="800" color={colors.ink} />
          </View>
        ) : (
          <Text style={styles.pickHint}>{t('waiterTabs.pickProducts')}</Text>
        )}

        <ScrollView style={styles.addList} keyboardShouldPersistTaps="handled">
          {filteredProducts.map((p) => {
            const line = addLines.find((l) => l.productId === p.id);
            const selected = !!line;
            return (
              <View
                key={p.id}
                style={[styles.addProduct, selected ? styles.addProductSelected : null]}
              >
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={() => setAddQty(p.id, (line?.quantity ?? 0) + 1)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.itemName, selected ? styles.itemNameSelected : null]}>
                    {p.name}
                  </Text>
                  <MoneyText amount={p.selling_price} size={11} color={colors.body} />
                </TouchableOpacity>
                {selected ? (
                  <View style={styles.qtyControls}>
                    <TouchableOpacity
                      style={styles.qtyBtnLight}
                      onPress={() => setAddQty(p.id, line.quantity - 1)}
                    >
                      <Ionicons name="remove" size={18} color={colors.primary} />
                    </TouchableOpacity>
                    <Text style={styles.qtyValueSelected}>{line.quantity}</Text>
                    <TouchableOpacity
                      style={styles.qtyBtnLight}
                      onPress={() => setAddQty(p.id, line.quantity + 1)}
                    >
                      <Ionicons name="add" size={18} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => setAddQty(p.id, 1)} hitSlop={8}>
                    <Ionicons name="add-circle-outline" size={26} color={colors.faint} />
                  </TouchableOpacity>
                )}
              </View>
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
          amount: `${payAmount.toLocaleString()} RWF`,
          remaining: `${remainingAfterPay.toLocaleString()} RWF`,
        })}
        confirmText={t('common.confirm')}
        variant="primary"
        loading={payMutation.isPending}
      />

      <ConfirmModal
        visible={showReturnConfirm}
        onClose={() => setShowReturnConfirm(false)}
        onConfirm={() => void doPartialReturn()}
        title={t('waiterTabs.confirmReturn')}
        message={t('waiterTabs.confirmReturnMessage')}
        confirmText={t('waiterTabs.returnPartial')}
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
  waiterName: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink },
  moneyRow: { flexDirection: 'row', gap: spacing.sm },
  moneyBlock: { flex: 1 },
  meta: { fontSize: 10, fontWeight: '600', color: colors.faint, marginBottom: 2 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  section: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.body,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  returnToggle: { fontSize: 12, fontWeight: '700', color: colors.danger },
  emptyItems: { color: colors.faint, marginBottom: spacing.md, fontSize: 12 },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemCardHighlight: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  itemCardReturn: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  returnActions: { gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.md },
  reasonInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 13,
    color: colors.ink,
    backgroundColor: colors.inputBg,
  },
  itemMain: { flex: 1 },
  itemName: { fontSize: 13, fontWeight: '600', color: colors.ink },
  itemNameSelected: { color: colors.primaryText },
  itemMeta: { fontSize: 11, color: colors.faint, marginTop: 1 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  qtyBtnLight: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  qtyValue: {
    minWidth: 22,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 13,
    color: colors.ink,
  },
  qtyValueSelected: {
    minWidth: 20,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 13,
    color: colors.primaryText,
  },
  payCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    ...shadows.card,
  },
  partialHint: {
    fontSize: 11,
    color: colors.body,
    marginBottom: spacing.xs,
    lineHeight: 15,
  },
  amountInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.xs,
    backgroundColor: colors.inputBg,
  },
  payMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  payFullBtn: { paddingVertical: 2 },
  payFullText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  remainingBox: { alignItems: 'flex-end' },
  pickerWrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  selectedBox: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    gap: spacing.xs,
  },
  selectedTitle: { fontSize: 11, fontWeight: '700', color: colors.primaryText },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  selectedName: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.primaryText },
  pickHint: {
    marginVertical: spacing.sm,
    fontSize: 12,
    color: colors.faint,
    textAlign: 'center',
  },
  addList: { maxHeight: 280 },
  addProduct: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: spacing.sm,
  },
  addProductSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
});

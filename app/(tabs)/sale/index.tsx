import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { colors, radius, spacing } from '@/theme/tokens';
import { Skeleton } from '@/components/Skeleton';
import { ConfirmModal } from '@/components/ConfirmModal';
import { PartyFormSheet, PartyFormData } from '@/components/PartyFormSheet';
import { ProductGrid } from '@/components/sale/ProductGrid';
import { CartBar } from '@/components/sale/CartBar';
import { CartSheet } from '@/components/sale/CartSheet';
import { PaymentSheet } from '@/components/sale/PaymentSheet';
import { CustomerPicker, WaiterPicker } from '@/components/sale/PartyPicker';
import { SaleDoneBanner } from '@/components/sale/SaleDoneBanner';
import { SaleHistoryList, HistoryFilter } from '@/components/sale/SaleHistoryList';
import { CustomPeriodSheet } from '@/components/home/CustomPeriodSheet';
import { showToast } from '@/stores/toastStore';
import {
  useProducts,
  useCustomers,
  useSales,
  useCreateCustomer,
  useVoidSale,
  useOpenDailyClosing,
  useBusinessUsers,
} from '@/hooks/useData';
import { useSaleCheckout, PayMethod } from '@/hooks/useSaleCheckout';
import { useSalesStore } from '@/stores/salesStore';
import { useAuthStore } from '@/stores/authStore';
import { getTodayDateString, getWeekStartDateString } from '@/utils/formatters';
import { toLocalDateString } from '@/utils/periodBounds';
import { Product } from '@/types';
import { receiptFromBusiness, shareReceiptPdf } from '@/utils/receipt';
import { canManageWaiterTabs } from '@/utils/permissions';

function monthStartIso(): string {
  const d = new Date();
  return toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1));
}

export default function NewSaleScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user, business } = useAuthStore();
  const { data: products, isLoading } = useProducts({ active: true });
  const { data: customers, refetch: refetchCustomers } = useCustomers();
  const { data: businessUsers } = useBusinessUsers();
  const voidSaleMutation = useVoidSale();
  const createCustomer = useCreateCustomer();

  const {
    cart,
    customerId,
    paymentMethod,
    addToCart,
    removeFromCart,
    updateCartItemQuantity,
    updateCartItemPrice,
    clearCart,
    setCustomer,
    setPaymentMethod,
    getSubtotal,
    getTotalDiscount,
    getTotalTax,
    getTotal,
    getItemCount,
  } = useSalesStore();

  const [tab, setTab] = React.useState<'new' | 'history'>('new');
  const [showCart, setShowCart] = React.useState(false);
  const [showPayment, setShowPayment] = React.useState(false);
  const [showCustomers, setShowCustomers] = React.useState(false);
  const [showWaiters, setShowWaiters] = React.useState(false);
  const [showAddCustomer, setShowAddCustomer] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);

  const checkout = useSaleCheckout({
    onNeedCustomer: () => setShowCustomers(true),
    onNeedWaiter: () => setShowWaiters(true),
  });

  const canIssueWaiter = canManageWaiterTabs(user?.role);
  const waiters = React.useMemo(
    () => (businessUsers ?? []).filter((u) => u.active && (u.role === 'STAFF' || u.role === 'CASHIER')),
    [businessUsers]
  );
  const selectedCustomer = customers?.find((c) => c.id === customerId) ?? null;
  const itemCount = getItemCount();

  const addProduct = (product: Product) => {
    const onHand = product.current_stock ?? 0;
    if (product.track_inventory && onHand <= 0) {
      showToast(t('sales.insufficientStock', { product: product.name }), 'error');
      return;
    }
    const inCart = cart.find((item) => item.product.id === product.id);
    if (product.track_inventory && inCart && inCart.quantity >= onHand) {
      showToast(t('sales.insufficientStock', { product: product.name }), 'error');
      return;
    }
    if (checkout.success) checkout.closeSuccess();
    addToCart(product);
  };

  const goToPayment = () => {
    if (cart.length === 0) return;
    checkout.resetMode();
    setShowCart(false);
    setShowPayment(true);
  };

  const closePayment = () => {
    setShowPayment(false);
    checkout.resetMode();
  };

  const confirm = async (override?: Parameters<typeof checkout.confirm>[0]) => {
    if (await checkout.confirm(override)) setShowPayment(false);
  };

  const payWith = (method: PayMethod) => {
    setPaymentMethod(method);
    void confirm({ method });
  };

  const today = getTodayDateString();
  const openClosingQuery = useOpenDailyClosing();
  const activeOpen = openClosingQuery.data?.status === 'open' ? openClosingQuery.data : null;
  const openDayStart = activeOpen?.business_date?.slice(0, 10) ?? null;
  const [historyFilterChoice, setHistoryFilterChoice] = React.useState<HistoryFilter | null>(null);
  const [customRange, setCustomRange] = React.useState<{ start: string; end: string } | null>(null);
  const [showCustomRange, setShowCustomRange] = React.useState(false);
  const chooseHistoryFilter = (next: HistoryFilter) => {
    if (next === 'custom') {
      setShowCustomRange(true);
      return;
    }
    setHistoryFilterChoice(next);
  };
  const historyFilter: HistoryFilter =
    historyFilterChoice === 'openDay' && !openDayStart
      ? 'today'
      : (historyFilterChoice ?? (openDayStart ? 'openDay' : 'today'));

  const historyRange = React.useMemo(() => {
    switch (historyFilter) {
      case 'openDay':
        return openDayStart ? { start: openDayStart, end: today } : { start: today, end: today };
      case 'today':
        return { start: today, end: today };
      case 'week':
        return { start: getWeekStartDateString(), end: today };
      case 'month':
        return { start: monthStartIso(), end: today };
      case 'year':
        return { start: `${today.slice(0, 4)}-01-01`, end: today };
      case 'custom':
        return customRange ?? { start: today, end: today };
      case 'all':
        return undefined;
    }
  }, [historyFilter, openDayStart, today, customRange]);

  const historyQuery = useSales(historyRange);
  const historySales = [...(historyQuery.data ?? [])].sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
  const historySubtitle = React.useMemo(() => {
    if (historyFilter === 'all') return t('sales.allTime');
    if (historyFilter === 'openDay' && openDayStart && openDayStart !== today) {
      return `${t('sales.openDayFilter')} · ${t('common.dateRange', { start: openDayStart, end: today })}`;
    }
    if (historyRange) return t('common.dateRange', { start: historyRange.start, end: historyRange.end });
    return t('sales.salesHistory');
  }, [historyFilter, openDayStart, today, historyRange, t]);
  const customerNameOf = (id: string | null) =>
    id ? (customers?.find((c) => c.id === id)?.name ?? t('sales.walkInCustomer')) : t('sales.walkInCustomer');
  const productNameOf = (id: string) => products?.find((p) => p.id === id)?.name ?? t('sales.items');
  const showHistoryDate = historyFilter !== 'today' && !(historyFilter === 'openDay' && openDayStart === today);

  const shareReceipt = async () => {
    const success = checkout.success;
    if (!success) return;
    try {
      await shareReceiptPdf(
        receiptFromBusiness(business, {
          date: today,
          lines: success.lines.map((l) => ({ name: l.name, qty: l.qty, price: l.price })),
          subtotal: success.total,
          total: success.total,
          paymentMethod: success.paymentMethod,
        })
      );
      showToast(t('sales.receiptShared'), 'success');
    } catch {
      showToast(t('sales.saleFailed'), 'error');
    }
  };

  const isHistory = tab === 'history';

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{isHistory ? t('sales.salesHistory') : t('sales.newSale')}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {isHistory
              ? historySubtitle
              : itemCount > 0
                ? `${itemCount} ${t('sales.items')}`
                : t('sales.tapProductsHint')}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.headerIconButton}
          onPress={() => router.push('/waiter-tabs' as any)}
          accessibilityRole="button"
          accessibilityLabel={t('navigation.waiterTabs')}
          hitSlop={6}
        >
          <Ionicons name="people-circle-outline" size={24} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => setTab(isHistory ? 'new' : 'history')}
          accessibilityRole="button"
        >
          <Ionicons name={isHistory ? 'add' : 'time-outline'} size={20} color={colors.primary} />
          <Text style={styles.headerButtonText}>{isHistory ? t('sales.newSale') : t('sales.history')}</Text>
        </TouchableOpacity>
      </View>

      {!isHistory ? (
        <SaleDoneBanner success={checkout.success} onShare={() => void shareReceipt()} onClose={checkout.closeSuccess} />
      ) : null}

      {isHistory ? (
        <SaleHistoryList
          sales={historySales}
          loading={historyQuery.isLoading}
          showDate={showHistoryDate}
          filter={historyFilter}
          hasOpenDay={!!openDayStart}
          onFilterChange={chooseHistoryFilter}
          customerNameOf={customerNameOf}
          productNameOf={productNameOf}
          voiding={voidSaleMutation.isPending}
          onVoid={(saleId) => {
            voidSaleMutation.mutate(saleId, {
              onSuccess: () => showToast(t('sales.saleVoided'), 'success'),
              onError: (error) => {
                const code = error instanceof Error ? error.message : '';
                if (code === 'FORBIDDEN') showToast(t('cash.noPermission'), 'error');
                else if (code === 'DAY_CLOSED') showToast(t('cash.dayAlreadyClosed'), 'error');
                else if (code === 'HISTORY_LOCKED') showToast(t('cash.historyLocked'), 'error');
                else if (code === 'ALREADY_VOID') showToast(t('sales.saleVoided'), 'info');
                else showToast(t('sales.saleFailed'), 'error');
              },
            });
          }}
        />
      ) : isLoading ? (
        <View style={styles.loading}>
          <Skeleton height={140} style={styles.skel} />
          <Skeleton height={140} style={styles.skel} />
        </View>
      ) : (
        <ProductGrid
          products={products ?? []}
          quantityOf={(id) => cart.find((line) => line.product.id === id)?.quantity ?? 0}
          onAdd={addProduct}
          bottomPadding={cart.length > 0 ? 120 : 40}
        />
      )}

      {!isHistory && cart.length > 0 ? (
        <CartBar itemCount={itemCount} total={getTotal()} onPress={goToPayment} />
      ) : null}

      <CartSheet
        visible={showCart}
        onClose={() => setShowCart(false)}
        cart={cart}
        itemCount={itemCount}
        total={getTotal()}
        onRemove={removeFromCart}
        onQuantityChange={updateCartItemQuantity}
        onPriceChange={updateCartItemPrice}
        onClear={() => setConfirmClear(true)}
        onNext={goToPayment}
      />

      <PaymentSheet
        visible={showPayment}
        onClose={closePayment}
        mode={checkout.mode}
        onModeChange={checkout.setMode}
        canIssueWaiter={canIssueWaiter}
        subtotal={getSubtotal()}
        discount={getTotalDiscount()}
        tax={getTotalTax()}
        total={getTotal()}
        profit={checkout.cartProfit}
        belowCost={checkout.hasBelowCostLine}
        paymentMethod={paymentMethod}
        onPay={payWith}
        onEditCart={() => {
          setShowPayment(false);
          setShowCart(true);
        }}
        customer={selectedCustomer}
        onPickCustomer={() => setShowCustomers(true)}
        waiter={checkout.waiter}
        onPickWaiter={() => setShowWaiters(true)}
        clientLabel={checkout.clientLabel}
        onClientLabel={checkout.setClientLabel}
        saving={checkout.saving}
        onConfirm={() => void confirm()}
      />

      <WaiterPicker
        visible={showWaiters}
        onClose={() => setShowWaiters(false)}
        waiters={waiters}
        selectedId={checkout.waiter?.id ?? null}
        onSelect={(waiter) => {
          checkout.setWaiter(waiter);
          setShowWaiters(false);
        }}
      />

      <CustomerPicker
        visible={showCustomers}
        onClose={() => setShowCustomers(false)}
        customers={customers ?? []}
        selectedId={customerId}
        onSelect={(id) => {
          setCustomer(id);
          setShowCustomers(false);
          if (showPayment && paymentMethod === 'credit' && id) void confirm({ method: 'credit', customerId: id });
        }}
        onAddNew={() => {
          setShowCustomers(false);
          setShowAddCustomer(true);
        }}
      />

      <ConfirmModal
        visible={checkout.belowCostWarning !== null}
        onClose={checkout.dismissBelowCost}
        onConfirm={async () => {
          if (await checkout.confirmBelowCost()) setShowPayment(false);
        }}
        title={t('sales.belowCostTitle')}
        message={t('sales.belowCostMessage', {
          product: checkout.belowCostWarning?.product ?? '',
          amount: `${(checkout.belowCostWarning?.shortfall ?? 0).toLocaleString()} RWF`,
        })}
        confirmText={t('sales.sellBelowCost')}
        loading={checkout.savingSale}
      />

      <ConfirmModal
        visible={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          clearCart();
          setShowCart(false);
        }}
        title={t('sales.clearCart')}
        message={t('sales.confirmClearCart')}
        confirmText={t('sales.clearCart')}
      />

      <PartyFormSheet
        visible={showAddCustomer}
        onClose={() => setShowAddCustomer(false)}
        kind="customer"
        saving={createCustomer.isPending}
        onSubmit={async (form: PartyFormData) => {
          try {
            const created = await createCustomer.mutateAsync({
              name: form.name,
              phone: form.phone,
              email: form.email,
              address: form.address,
              credit_limit: form.credit_limit,
            });
            setCustomer(created.id);
            setShowAddCustomer(false);
            if (showPayment && paymentMethod === 'credit') void confirm({ method: 'credit', customerId: created.id });
            await refetchCustomers();
            showToast(t('customers.customerAdded'), 'success');
          } catch {
            showToast(t('customers.customerFailed'), 'error');
          }
        }}
      />

      <CustomPeriodSheet
        visible={showCustomRange}
        onClose={() => setShowCustomRange(false)}
        onApply={(start, end) => {
          setCustomRange({ start, end });
          setHistoryFilterChoice('custom');
          setShowCustomRange(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: 2 },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  headerButtonText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  loading: { paddingHorizontal: spacing.lg },
  skel: { borderRadius: radius.md, marginBottom: spacing.sm },
});

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { Button } from '@/components/Button';
import { MoneyText } from '@/components/MoneyText';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { BottomSheet, SegmentedControl } from '@/components/SegmentedControl';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showToast } from '@/stores/toastStore';
import { useProducts, useCustomers, useCreateSale, useSales, useSaleItems, useCreateCustomer, useVoidSale, useOpenDailyClosing } from '@/hooks/useData';
import { useSalesStore, CartItem } from '@/stores/salesStore';
import { useAuthStore } from '@/stores/authStore';
import { debounce, formatNumber, getInitials, getTodayDateString } from '@/utils/formatters';
import { PAYMENT_METHODS } from '@/constants';
import { Customer, Product } from '@/types';
import { receiptFromBusiness, shareReceiptPdf } from '@/utils/receipt';
import { PartyFormSheet, PartyFormData } from '@/components/PartyFormSheet';

type PayMethod = 'cash' | 'mobile_money' | 'bank' | 'credit';
const PRODUCT_PAGE_SIZE = 100;

export default function NewSaleScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const productColumns = width >= 980 ? 4 : width >= 680 ? 3 : 2;
  const { data: products, isLoading } = useProducts({ active: true });
  const { data: customers, refetch: refetchCustomers } = useCustomers();
  const createSaleMutation = useCreateSale();
  const voidSaleMutation = useVoidSale();
  const createCustomer = useCreateCustomer();
  const [showAddCustomer, setShowAddCustomer] = React.useState(false);

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

  const [visibleCount, setVisibleCount] = React.useState(PRODUCT_PAGE_SIZE);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [liveQuery, setLiveQuery] = React.useState('');
  const [showPaymentSheet, setShowPaymentSheet] = React.useState(false);
  const [showCartSheet, setShowCartSheet] = React.useState(false);
  const [showCustomerSheet, setShowCustomerSheet] = React.useState(false);
  const [tab, setTab] = React.useState<'new' | 'history'>('new');
  const [success, setSuccess] = React.useState<{
    total: number;
    profit: number;
    lines: Array<{ name: string; qty: number; price: number; before: number | null; after: number | null }>;
  } | null>(null);
  const [belowCostWarning, setBelowCostWarning] = React.useState<{ shortfall: number; product?: string } | null>(null);

  const debouncedSearch = React.useMemo(
    () => debounce((...args: unknown[]) => setLiveQuery(args[0] as string), 250),
    []
  );

  const filteredProducts = React.useMemo(() => {
    if (!products) return [];
    if (!liveQuery) return products;
    const q = liveQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q)
    );
  }, [products, liveQuery]);

  React.useEffect(() => {
    setVisibleCount(PRODUCT_PAGE_SIZE);
  }, [liveQuery]);

  const visibleProducts = filteredProducts.slice(0, visibleCount);

  const selectedCustomer: Customer | null =
    customers?.find((c) => c.id === customerId) ?? null;

  const cartProfit = React.useMemo(() => {
    return cart.reduce((sum, item) => {
      const cost = item.product.average_cost ?? 0;
      return sum + item.sellingPrice * item.quantity - item.discountAmount - cost * item.quantity;
    }, 0);
  }, [cart]);

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
    addToCart(product);
  };

  const startCheckout = () => {
    if (cart.length === 0) return;
    setShowCartSheet(false);
    setShowPaymentSheet(true);
  };

  const { user } = useAuthStore();
  const canOverridePrice = user?.role === 'OWNER' || user?.role === 'MANAGER';

  const submitSale = async (allowBelowCost = false) => {
    await createSaleMutation.mutateAsync({
      customerId,
      items: cart.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        sellingPrice: item.sellingPrice,
        discountAmount: item.discountAmount,
        taxAmount: item.taxAmount,
      })),
      paymentMethod: paymentMethod as PayMethod,
      notes: undefined,
      allowBelowCost,
    });
  };

  const confirmSale = async () => {
    if (paymentMethod === 'credit' && !customerId) {
      showToast(t('sales.customerRequired'), 'error');
      setShowCustomerSheet(true);
      return;
    }
    try {
      await submitSale(false);
      setSuccess({
        total: getTotal(),
        profit: cartProfit,
        lines: cart.map((item) => {
          const before = item.product.current_stock ?? null;
          return {
            name: item.product.name,
            qty: item.quantity,
            price: item.sellingPrice,
            before,
            after: before !== null ? before - item.quantity : null,
          };
        }),
      });
      clearCart();
      setShowPaymentSheet(false);
    } catch (error) {
      console.error('Sale failed:', error);
      const code = error instanceof Error ? error.message : '';
      const productName = error instanceof Error ? (error as Error & { productName?: string }).productName : undefined;
      if (code === 'INSUFFICIENT_STOCK') {
        showToast(t('sales.insufficientStock', { product: productName ?? '' }), 'error');
      } else if (code === 'DAY_CLOSED') {
        showToast(t('cash.dayAlreadyClosed'), 'error');
      } else if (code === 'CREDIT_LIMIT') {
        showToast(t('sales.creditLimit'), 'error');
      } else if (code === 'INVALID_PRICE') {
        showToast(t('sales.priceRequired'), 'error');
      } else if (code === 'CUSTOMER_REQUIRED') {
        showToast(t('sales.customerRequired'), 'error');
        setShowCustomerSheet(true);
      } else if (code === 'BELOW_COST') {
        const shortfall = (error as Error & { shortfall?: number }).shortfall ?? 0;
        if (canOverridePrice) {
          setBelowCostWarning({ shortfall, product: productName });
        } else {
          showToast(t('sales.belowCostBlocked', { amount: `${shortfall.toLocaleString()} RWF` }), 'error');
        }
      } else {
        showToast(t('sales.saleFailed'), 'error');
      }
    }
  };

  const closeSuccess = () => setSuccess(null);

  const today = getTodayDateString();
  const openClosingQuery = useOpenDailyClosing();
  const activeOpen = openClosingQuery.data?.status === 'open' ? openClosingQuery.data : null;
  const historyStart = activeOpen?.business_date?.slice(0, 10) ?? today;
  const historyQuery = useSales({ start: historyStart, end: today });
  const { business } = useAuthStore();
  const todaysSales = [...(historyQuery.data ?? [])].sort((a, b) =>
    (b.created_at > a.created_at ? 1 : -1)
  );
  const customerNameOf = (id: string | null) =>
    id ? (customers?.find((c) => c.id === id)?.name ?? t('sales.walkInCustomer')) : t('sales.walkInCustomer');
  const productNameOf = (id: string) =>
    products?.find((p) => p.id === id)?.name ?? t('sales.items');

  const shareReceipt = async () => {
    if (!success) return;
    try {
      await shareReceiptPdf(
        receiptFromBusiness(business, {
          date: today,
          lines: success.lines.map((l) => ({ name: l.name, qty: l.qty, price: l.price })),
          subtotal: success.total,
          total: success.total,
          paymentMethod,
        })
      );
      showToast(t('sales.receiptShared'), 'success');
    } catch {
      showToast(t('sales.saleFailed'), 'error');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View>
          <Text style={styles.title}>{t('sales.newSale')}</Text>
          <Text style={styles.subtitle}>
            {tab === 'new'
              ? `${getItemCount()} ${t('sales.items')}`
              : historyStart !== today
                ? `${t('sales.todaysSales')} · ${historyStart} → ${today}`
                : t('sales.todaysSales')}
          </Text>
        </View>
        {tab === 'new' ? (
          <TouchableOpacity
            onPress={() => setShowCartSheet(true)}
            hitSlop={12}
            style={styles.cartButton}
            accessibilityLabel={t('sales.cart')}
          >
            <Ionicons name="cart-outline" size={26} color={colors.ink} />
            {getItemCount() > 0 ? (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{getItemCount()}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.tabWrap}>
        <SegmentedControl
          options={[
            { value: 'new', label: t('sales.newSale') },
            { value: 'history', label: t('sales.history') },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {tab === 'history' ? (
        <SaleHistoryList
          sales={todaysSales}
          loading={historyQuery.isLoading}
          customerNameOf={customerNameOf}
          productNameOf={productNameOf}
          voiding={voidSaleMutation.isPending}
          onVoid={(saleId) => {
            voidSaleMutation.mutate(saleId, {
              onSuccess: () => showToast(t('sales.saleVoided'), 'success'),
              onError: (error) => {
                const code = error instanceof Error ? error.message : '';
                if (code === 'DAY_CLOSED') showToast(t('cash.dayAlreadyClosed'), 'error');
                else if (code === 'ALREADY_VOID') showToast(t('sales.saleVoided'), 'info');
                else showToast(t('sales.saleFailed'), 'error');
              },
            });
          }}
        />
      ) : isLoading ? (
        <View style={styles.list}>
          <Skeleton height={76} style={styles.skel} />
          <Skeleton height={76} style={styles.skel} />
          <Skeleton height={76} style={styles.skel} />
        </View>
      ) : (
        <FlatList
          key={productColumns}
          data={visibleProducts}
          keyExtractor={(item) => item.id}
          numColumns={productColumns}
          columnWrapperStyle={styles.productRow}
          style={styles.flex}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (visibleCount < filteredProducts.length) {
              setVisibleCount((count) => count + PRODUCT_PAGE_SIZE);
            }
          }}
          onEndReachedThreshold={0.4}
          contentContainerStyle={StyleSheet.flatten([
            styles.list,
            cart.length > 0 ? styles.listWithCart : null,
          ])}
          ListHeaderComponent={
            <View>
              <View style={styles.searchWrap}>
                <SearchBar
                  value={searchQuery}
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    debouncedSearch(text);
                  }}
                  placeholder={t('stock.searchProducts')}
                />
              </View>

              <View style={styles.listHeader}>
                <Text style={styles.listTitle}>{t('stock.products')}</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="search"
              title={liveQuery ? t('common.noResults') : t('stock.noProducts')}
              message={liveQuery ? undefined : t('stock.addFirstProduct')}
            />
          }
          renderItem={({ item }) => (
            <PosProductCard
              product={item}
              quantity={cart.find((line) => line.product.id === item.id)?.quantity ?? 0}
              onPress={() => addProduct(item)}
            />
          )}
        />
      )}

      {tab === 'new' && cart.length > 0 ? (
        <TouchableOpacity
          style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
          onPress={() => setShowCartSheet(true)}
          activeOpacity={0.85}
          accessibilityLabel={t('sales.cart')}
        >
          <View style={styles.bottomCartIcon}>
            <Ionicons name="cart" size={22} color={colors.white} />
            <View style={styles.bottomCartCount}>
              <Text style={styles.bottomCartCountText}>{getItemCount()}</Text>
            </View>
          </View>
          <View style={styles.bottomTotal}>
            <Text style={styles.bottomLabel}>{t('sales.cart')}</Text>
            <Text style={styles.bottomCount}>{getItemCount()} {t('sales.items')}</Text>
          </View>
          <MoneyText amount={getTotal()} size={22} weight="800" color={colors.ink} />
          <Ionicons name="chevron-up" size={20} color={colors.muted} />
        </TouchableOpacity>
      ) : null}

      <BottomSheet
        visible={showCartSheet}
        onClose={() => setShowCartSheet(false)}
        title={`${t('sales.cart')} · ${getItemCount()}`}
      >
        {cart.length === 0 ? (
          <EmptyState icon="cart-outline" title={t('sales.emptyCart')} message={t('sales.addProducts')} />
        ) : (
          <View style={styles.sheetBody}>
            <ScrollView style={styles.cartSheetList} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {cart.map((item) => (
                <CartLine
                  key={item.product.id}
                  item={item}
                  onRemove={() => removeFromCart(item.product.id)}
                  onQuantityChange={(qty) => updateCartItemQuantity(item.product.id, qty)}
                  onPriceChange={(price) => updateCartItemPrice(item.product.id, price)}
                />
              ))}
            </ScrollView>
            <View style={styles.cartSheetFooter}>
              <View style={styles.cartSheetTotal}>
                <Text style={styles.totalLabel}>{t('sales.total')}</Text>
                <MoneyText amount={getTotal()} size={22} weight="800" color={colors.ink} />
              </View>
              <TouchableOpacity onPress={() => clearCart()} hitSlop={8} accessibilityLabel={t('sales.emptyCart')}>
                <Text style={styles.clearCartText}>{t('common.delete')}</Text>
              </TouchableOpacity>
              <Button variant="primary" size="lg" fullWidth onPress={startCheckout}>
                {t('sales.completeSale')}
              </Button>
            </View>
          </View>
        )}
      </BottomSheet>

      <BottomSheet
        visible={showPaymentSheet}
        onClose={() => setShowPaymentSheet(false)}
        title={t('sales.completeSale')}
      >
        <View style={styles.sheetBody}>
          <View style={styles.summaryCard}>
            <SummaryRow label={t('sales.subtotal')} value={getSubtotal()} />
            {getTotalDiscount() > 0 ? (
              <SummaryRow label={t('sales.discount')} value={-getTotalDiscount()} negative />
            ) : null}
            {getTotalTax() > 0 ? <SummaryRow label={t('sales.tax')} value={getTotalTax()} /> : null}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('sales.total')}</Text>
              <MoneyText amount={getTotal()} size={22} weight="800" color={colors.ink} />
            </View>
            <View style={styles.profitRow}>
              <Text style={styles.profitLabel}>{t('sales.profitOnSale')}</Text>
              <MoneyText amount={cartProfit} size={14} weight="700" />
            </View>
            {cart.some((item) => {
              const cost = item.product.track_inventory ? (item.product.average_cost ?? 0) : 0;
              if (cost <= 0 || item.quantity <= 0) return false;
              return Math.round((item.quantity * item.sellingPrice - item.discountAmount) / item.quantity) < cost;
            }) ? (
              <Text style={styles.belowCostHint}>{t('sales.belowCostHint')}</Text>
            ) : null}
          </View>

          <Text style={styles.sheetLabel}>{t('sales.paymentMethod')}</Text>
          <View style={styles.methodGrid}>
            {PAYMENT_METHODS.map((m) => {
              const active = paymentMethod === m.value;
              return (
                <TouchableOpacity
                  key={m.value}
                  style={[styles.method, active && styles.methodActive]}
                  onPress={() => setPaymentMethod(m.value as PayMethod)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={
                      m.value === 'cash' ? 'cash' : m.value === 'mobile_money' ? 'phone-portrait' : m.value === 'bank' ? 'card' : 'person'
                    }
                    size={22}
                    color={active ? colors.primary : colors.muted}
                  />
                  <Text style={[styles.methodLabel, active && styles.methodLabelActive]}>
                    {t(`sales.${m.value === 'mobile_money' ? 'mobileMoney' : m.value}` as any)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {paymentMethod === 'credit' ? (
            <TouchableOpacity style={styles.customerRow} onPress={() => setShowCustomerSheet(true)} activeOpacity={0.8}>
              <Ionicons name="person-circle-outline" size={28} color={colors.primary} />
              <View style={styles.customerInfo}>
                <Text style={styles.customerName}>
                  {selectedCustomer ? selectedCustomer.name : t('sales.selectCustomer')}
                </Text>
                {selectedCustomer?.phone ? (
                  <Text style={styles.customerPhone}>{selectedCustomer.phone}</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.faint} />
            </TouchableOpacity>
          ) : null}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={createSaleMutation.isPending}
            onPress={confirmSale}
          >
            {t('sales.completeSale')}
          </Button>
          <View style={styles.sheetSpacer} />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={showCustomerSheet}
        onClose={() => setShowCustomerSheet(false)}
        title={t('sales.selectCustomer')}
      >
        <TouchableOpacity
          style={styles.addPartyBtn}
          onPress={() => {
            setShowCustomerSheet(false);
            setShowAddCustomer(true);
          }}
        >
          <Ionicons name="person-add-outline" size={18} color={colors.primary} />
          <Text style={styles.addPartyText}>{t('customers.addCustomer')}</Text>
        </TouchableOpacity>
        <FlatList
          data={customers ?? []}
          keyExtractor={(item) => item.id}
          style={styles.customerList}
          renderItem={({ item }) => {
            const active = customerId === item.id;
            return (
              <TouchableOpacity
                style={[styles.customerOption, active && styles.customerOptionActive]}
                onPress={() => {
                  setCustomer(item.id);
                  setShowCustomerSheet(false);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.customerAvatar}>
                  <Text style={styles.customerAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.customerInfo}>
                  <Text style={styles.customerName}>{item.name}</Text>
                  {item.phone ? <Text style={styles.customerPhone}>{item.phone}</Text> : null}
                </View>
                {active ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.noCustomers}>{t('common.noCustomers')}</Text>
          }
        />
        <View style={styles.sheetSpacer} />
      </BottomSheet>

      <ConfirmModal
        visible={belowCostWarning !== null}
        onClose={() => setBelowCostWarning(null)}
        onConfirm={async () => {
          const warn = belowCostWarning;
          setBelowCostWarning(null);
          if (!warn) return;
          try {
            await submitSale(true);
            setSuccess({
              total: getTotal(),
              profit: cartProfit,
              lines: cart.map((item) => {
                const before = item.product.current_stock ?? null;
                return {
                  name: item.product.name,
                  qty: item.quantity,
                  price: item.sellingPrice,
                  before,
                  after: before !== null ? before - item.quantity : null,
                };
              }),
            });
            clearCart();
            setShowPaymentSheet(false);
          } catch {
            showToast(t('sales.saleFailed'), 'error');
          }
        }}
        title={t('sales.belowCostTitle')}
        message={t('sales.belowCostMessage', {
          product: belowCostWarning?.product ?? '',
          amount: `${(belowCostWarning?.shortfall ?? 0).toLocaleString()} RWF`,
        })}
        confirmText={t('sales.sellBelowCost')}
        loading={createSaleMutation.isPending}
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
            await refetchCustomers();
            showToast(t('customers.customerAdded'), 'success');
          } catch {
            showToast(t('customers.customerFailed'), 'error');
          }
        }}
      />

      <Modal visible={success !== null} transparent animationType="fade" onRequestClose={closeSuccess}>
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.successScroll}>
              <View style={styles.successInner}>
                <View style={styles.successIcon}>
                  <Ionicons name="checkmark" size={36} color="#fff" />
                </View>
                <Text style={styles.successTitle}>{t('sales.saleCompleted')}</Text>
                <MoneyText amount={success?.total ?? 0} size={30} weight="800" color={colors.ink} />
                <View style={styles.successMeta}>
                  <Text style={styles.successMetaText}>
                    {t('sales.profitOnSale')}: {(success?.profit ?? 0).toLocaleString()} RWF
                  </Text>
                  <Text style={styles.successMetaText}>{t('sales.stockUpdated')}</Text>
                </View>
                {(success?.lines ?? []).map((line, i) => (
                  <View key={i} style={styles.stockLine}>
                    <Text style={styles.stockLineName} numberOfLines={1}>{line.name}</Text>
                    <Text style={styles.stockLineQty}>
                      {line.before !== null && line.after !== null
                        ? `${line.before} → ${line.after}`
                        : `×${line.qty}`}
                    </Text>
                  </View>
                ))}
                <View style={styles.successActions}>
                  <Button variant="outline" size="lg" fullWidth onPress={shareReceipt} leftIcon={<Ionicons name="share-outline" size={18} color={colors.primary} />}>
                    {t('sales.sharePdf80')}
                  </Button>
                  <Button variant="primary" size="lg" fullWidth onPress={closeSuccess}>
                    {t('common.done')}
                  </Button>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const TILE_COLORS = ['#4338ca', '#0f766e', '#b45309', '#be123c', '#1d4ed8', '#7c3aed', '#047857', '#c2410c'];

function tileColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i) * (i + 1)) % TILE_COLORS.length;
  return TILE_COLORS[hash] ?? TILE_COLORS[0];
}

function PosProductCard({
  product,
  quantity,
  onPress,
}: {
  product: Product;
  quantity: number;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const selected = quantity > 0;
  const stock = product.track_inventory ? (product.current_stock ?? null) : null;
  const out = stock !== null && stock <= 0;
  return (
    <TouchableOpacity
      style={[styles.posCard, selected && styles.posCardSelected, out && styles.posCardOut]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={[styles.posImage, { backgroundColor: tileColor(product.name) }]}>
        <Text style={styles.posInitials}>{getInitials(product.name)}</Text>
        {selected ? (
          <View style={styles.posQty}>
            <Text style={styles.posQtyText}>{quantity}</Text>
          </View>
        ) : null}
        {stock !== null ? (
          <View style={[styles.posStockPill, out && styles.posStockPillOut]}>
            <Text style={[styles.posStockPillText, out && styles.posStockPillTextOut]} numberOfLines={1}>
              {out ? t('stock.outOfStock') : `${formatNumber(stock)} ${product.unit}`}
            </Text>
          </View>
        ) : (
          <View style={styles.posStockPill}>
            <Text style={styles.posStockPillText} numberOfLines={1}>{product.unit}</Text>
          </View>
        )}
      </View>
      <View style={styles.posMeta}>
        <Text style={styles.posName} numberOfLines={2}>{product.name}</Text>
        {product.sku ? <Text style={styles.posSku} numberOfLines={1}>{product.sku}</Text> : null}
        <MoneyText amount={product.selling_price} size={15} weight="800" color={selected ? colors.primaryText : colors.ink} />
      </View>
    </TouchableOpacity>
  );
}

function CartLine({
  item,
  onRemove,
  onQuantityChange,
  onPriceChange,
}: {
  item: CartItem;
  onRemove: () => void;
  onQuantityChange: (qty: number) => void;
  onPriceChange: (price: number) => void;
}) {
  const { t } = useTranslation();
  const [qtyText, setQtyText] = React.useState(String(item.quantity));
  const [priceText, setPriceText] = React.useState(String(item.sellingPrice));

  React.useEffect(() => {
    setQtyText(String(item.quantity));
  }, [item.quantity]);

  React.useEffect(() => {
    setPriceText(String(item.sellingPrice));
  }, [item.sellingPrice]);

  const commitQty = () => {
    const parsed = parseInt(qtyText.replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setQtyText(String(item.quantity));
      return;
    }
    const stock = item.product.track_inventory ? item.product.current_stock : null;
    const cap = stock != null ? Math.max(0, stock) : null;
    if (cap != null && cap < 1) {
      setQtyText(String(item.quantity));
      return;
    }
    const next = cap != null ? Math.min(parsed, cap) : parsed;
    onQuantityChange(next);
    setQtyText(String(next));
  };

  const commitPrice = () => {
    const parsed = parseInt(priceText.replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setPriceText(String(item.sellingPrice));
      return;
    }
    onPriceChange(parsed);
    setPriceText(String(parsed));
  };

  return (
    <View style={styles.cartRow}>
      <View style={styles.cartTop}>
        <Text style={styles.cartName} numberOfLines={1}>{item.product.name}</Text>
        <TouchableOpacity onPress={onRemove} hitSlop={10} accessibilityLabel={t('sales.removeItem')}>
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </TouchableOpacity>
      </View>

      <View style={styles.cartEditors}>
        <View style={styles.editorBlock}>
          <Text style={styles.editorLabel}>{t('sales.price')}</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.editorInput}
              value={priceText}
              onChangeText={(text) => setPriceText(text.replace(/[^\d]/g, ''))}
              onBlur={commitPrice}
              onSubmitEditing={commitPrice}
              keyboardType="number-pad"
              returnKeyType="done"
              selectTextOnFocus
              accessibilityLabel={t('sales.price')}
            />
            <Text style={styles.inputSuffix}>RWF</Text>
          </View>
        </View>

        <View style={styles.editorBlockQty}>
          <Text style={styles.editorLabel}>{t('sales.quantity')}</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepButton}
              onPress={() =>
                item.quantity <= 1 ? onRemove() : onQuantityChange(item.quantity - 1)
              }
              hitSlop={6}
              accessibilityLabel={t('sales.decreaseQty')}
            >
              <Ionicons name={item.quantity <= 1 ? 'trash-outline' : 'remove'} size={18} color={colors.primary} />
            </TouchableOpacity>
            <TextInput
              style={styles.qtyInput}
              value={qtyText}
              onChangeText={(text) => setQtyText(text.replace(/[^\d]/g, ''))}
              onBlur={commitQty}
              onSubmitEditing={commitQty}
              keyboardType="number-pad"
              returnKeyType="done"
              selectTextOnFocus
              accessibilityLabel={t('sales.quantity')}
            />
            <TouchableOpacity
              style={styles.stepButton}
              onPress={() => {
                const stock = item.product.track_inventory ? item.product.current_stock : null;
                if (stock != null && item.quantity >= stock) return;
                onQuantityChange(item.quantity + 1);
              }}
              hitSlop={6}
              accessibilityLabel={t('sales.increaseQty')}
            >
              <Ionicons name="add" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.lineTotal}>
          <Text style={styles.editorLabel}>{t('sales.total')}</Text>
          <MoneyText amount={item.quantity * item.sellingPrice} size={15} weight="800" color={colors.ink} />
        </View>
      </View>
    </View>
  );
}

function SaleHistoryList({
  sales,
  loading,
  customerNameOf,
  productNameOf,
  voiding,
  onVoid,
}: {
  sales: Array<{ id: string; reference_number: string | null; total_amount: number; payment_status: string; customer_id: string | null; created_at: string; voided?: boolean }>;
  loading: boolean;
  customerNameOf: (id: string | null) => string;
  productNameOf: (id: string) => string;
  voiding: boolean;
  onVoid: (saleId: string) => void;
}) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [pendingVoidId, setPendingVoidId] = React.useState<string | null>(null);

  if (loading) {
    return (
      <View style={styles.list}>
        <Skeleton height={68} style={styles.skel} />
        <Skeleton height={68} style={styles.skel} />
      </View>
    );
  }

  if (sales.length === 0) {
    return (
      <EmptyState
        icon="receipt-outline"
        title={t('dashboard.noSalesYet')}
        message={t('dashboard.noSalesMessage')}
      />
    );
  }

  return (
    <FlatList
      data={sales}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <SaleHistoryRow
          sale={item}
          customerName={customerNameOf(item.customer_id)}
          productNameOf={productNameOf}
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

function SaleHistoryRow({
  sale,
  customerName,
  productNameOf,
  expanded,
  onToggle,
  onVoid,
}: {
  sale: { id: string; reference_number: string | null; total_amount: number; payment_status: string; voided?: boolean };
  customerName: string;
  productNameOf: (id: string) => string;
  expanded: boolean;
  onToggle: () => void;
  onVoid: () => void;
}) {
  const { t } = useTranslation();
  const { data: items } = useSaleItems(expanded ? sale.id : null);
  const voided = sale.voided === true;
  const tone = voided ? 'neutral' : sale.payment_status === 'paid' ? 'success' : sale.payment_status === 'credit' || sale.payment_status === 'partial' ? 'warning' : 'neutral';
  const statusLabel = voided ? t('sales.voided') : sale.payment_status;
  return (
    <TouchableOpacity style={styles.historyCard} onPress={onToggle} activeOpacity={0.8}>
      <View style={styles.historyTop}>
        <View style={styles.historyInfo}>
          <Text style={styles.historyRef} numberOfLines={1}>{sale.reference_number ?? sale.id.slice(0, 8)}</Text>
          <Text style={styles.historySub}>{customerName}</Text>
        </View>
        <View style={styles.historyRight}>
          <MoneyText amount={sale.total_amount} size={16} weight="800" color={colors.ink} />
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

function SummaryRow({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <MoneyText amount={value} size={14} weight="600" color={negative ? colors.danger : colors.body} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  cartButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
  cartSheetList: {
    maxHeight: 360,
  },
  cartSheetFooter: {
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  cartSheetTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clearCartText: {
    textAlign: 'center',
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
  },
  searchWrap: {
    marginBottom: spacing.sm,
  },
  tabWrap: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  cartRow: {
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: spacing.sm,
  },
  cartTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cartName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  cartEditors: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  editorBlock: {
    flex: 1.2,
    gap: 4,
  },
  editorBlockQty: {
    flex: 1,
    gap: 4,
  },
  editorLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: 0.3,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    minHeight: 40,
  },
  editorInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    paddingVertical: 8,
    fontVariant: ['tabular-nums'],
  },
  inputSuffix: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.faint,
    marginLeft: 4,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 2,
    minHeight: 40,
  },
  stepButton: {
    width: 32,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyInput: {
    minWidth: 36,
    maxWidth: 56,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
    paddingVertical: 6,
    fontVariant: ['tabular-nums'],
  },
  lineTotal: {
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    gap: 4,
    minWidth: 72,
  },
  productRow: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  posCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.card,
  },
  posCardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  posCardOut: {
    opacity: 0.72,
  },
  posImage: {
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posInitials: {
    color: colors.white,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 1,
  },
  posQty: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 6,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posQtyText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  posStockPill: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    maxWidth: '90%',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  posStockPillOut: {
    backgroundColor: colors.dangerSoft,
  },
  posStockPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.ink,
  },
  posStockPillTextOut: {
    color: colors.dangerText,
  },
  posMeta: {
    padding: spacing.md,
    gap: 2,
  },
  posName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    minHeight: 36,
  },
  posSku: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.faint,
    marginBottom: 4,
  },
  listHeader: {
    paddingVertical: spacing.sm,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
    flexGrow: 1,
  },
  listWithCart: {
    paddingBottom: 120,
  },
  skel: {
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  bottomCartIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomCartCount: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomCartCountText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
  bottomTotal: {
    flex: 1,
  },
  bottomLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  bottomCount: {
    fontSize: 12,
    color: colors.faint,
  },
  sheetBody: {
    gap: spacing.md,
  },
  summaryCard: {
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.body,
  },
  historyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  historyTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  historyInfo: {
    flex: 1,
  },
  historyRef: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  historySub: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  historyRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  historyItems: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: 4,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  historyItemName: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
    fontWeight: '600',
  },
  historyItemQty: {
    fontSize: 13,
    color: colors.body,
  },
  historyItemTotal: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  voidButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  voidButtonText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  profitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  profitLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  belowCostHint: {
    fontSize: 13,
    color: colors.danger,
    fontWeight: '600',
    marginTop: 6,
  },
  sheetLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  methodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  method: {
    flexGrow: 1,
    minWidth: '47%',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    gap: 6,
    backgroundColor: colors.card,
  },
  methodActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  methodLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  methodLabelActive: {
    color: colors.primaryText,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  customerPhone: {
    fontSize: 13,
    color: colors.muted,
  },
  customerList: {
    maxHeight: 320,
  },
  addPartyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  addPartyText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  customerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    gap: spacing.md,
    minHeight: 60,
  },
  customerOptionActive: {
    backgroundColor: colors.primarySoft,
  },
  customerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },
  noCustomers: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  sheetSpacer: {
    height: spacing.lg,
  },
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
  },
  successCard: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  successScroll: {
    width: '100%',
  },
  successInner: {
    alignItems: 'center',
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  successTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  successMeta: {
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    gap: 4,
  },
  successMetaText: {
    fontSize: 13,
    color: colors.muted,
  },
  stockLine: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: 6,
    gap: spacing.sm,
  },
  stockLineName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  stockLineQty: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.successText,
    fontVariant: ['tabular-nums'],
  },
  successActions: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});

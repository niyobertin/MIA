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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { Button } from '@/components/Button';
import { ProductCard } from '@/components/ProductCard';
import { MoneyText } from '@/components/MoneyText';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { BottomSheet, SegmentedControl } from '@/components/SegmentedControl';
import { StatusBadge } from '@/components/StatusBadge';
import { showToast } from '@/stores/toastStore';
import { useProducts, useCustomers, useCreateSale, useSales, useSaleItems } from '@/hooks/useData';
import { useSalesStore, CartItem } from '@/stores/salesStore';
import { useAuthStore } from '@/stores/authStore';
import { debounce } from '@/utils/formatters';
import { PAYMENT_METHODS } from '@/constants';
import { Customer } from '@/types';
import { receiptFromBusiness, shareReceiptPdf } from '@/utils/receipt';

type PayMethod = 'cash' | 'mobile_money' | 'bank' | 'credit';

export default function NewSaleScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data: products, isLoading } = useProducts({ active: true });
  const { data: customers } = useCustomers();
  const createSaleMutation = useCreateSale();

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

  const [searchQuery, setSearchQuery] = React.useState('');
  const [liveQuery, setLiveQuery] = React.useState('');
  const [showPaymentSheet, setShowPaymentSheet] = React.useState(false);
  const [showCustomerSheet, setShowCustomerSheet] = React.useState(false);
  const [tab, setTab] = React.useState<'new' | 'history'>('new');
  const [success, setSuccess] = React.useState<{
    total: number;
    profit: number;
    lines: Array<{ name: string; qty: number; price: number; before: number | null; after: number | null }>;
  } | null>(null);

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

  const selectedCustomer: Customer | null =
    customers?.find((c) => c.id === customerId) ?? null;

  const cartProfit = React.useMemo(() => {
    return cart.reduce((sum, item) => {
      const cost = item.product.average_cost ?? 0;
      return sum + (item.sellingPrice - cost) * item.quantity;
    }, 0);
  }, [cart]);

  const startCheckout = () => {
    if (cart.length === 0) return;
    setShowPaymentSheet(true);
  };

  const confirmSale = async () => {
    if (paymentMethod === 'credit' && !customerId) {
      showToast(t('sales.customerRequired'), 'error');
      setShowCustomerSheet(true);
      return;
    }
    try {
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
      });
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
      showToast(t('sales.saleFailed'), 'error');
    }
  };

  const closeSuccess = () => setSuccess(null);

  const today = new Date().toISOString().split('T')[0];
  const historyQuery = useSales({ start: today, end: today });
  const { business } = useAuthStore();
  const todaysSales = [...(historyQuery.data ?? [])].sort((a, b) =>
    (b.created_at > a.created_at ? 1 : -1)
  );
  const customerNameOf = (id: string | null) =>
    id ? (customers?.find((c) => c.id === id)?.name ?? t('sales.walkInCustomer')) : t('sales.walkInCustomer');

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
            {tab === 'new' ? `${getItemCount()} ${t('sales.items')}` : t('sales.todaysSales')}
          </Text>
        </View>
        {tab === 'new' && cart.length > 0 ? (
          <TouchableOpacity onPress={() => clearCart()} hitSlop={12} style={styles.clearButton} accessibilityLabel={t('sales.emptyCart')}>
            <Ionicons name="trash-outline" size={22} color={colors.danger} />
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
        <SaleHistoryList sales={todaysSales} loading={historyQuery.isLoading} customerNameOf={customerNameOf} />
      ) : isLoading ? (
        <View style={styles.list}>
          <Skeleton height={76} style={styles.skel} />
          <Skeleton height={76} style={styles.skel} />
          <Skeleton height={76} style={styles.skel} />
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          style={styles.flex}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
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

              {cart.length > 0 ? (
                <View style={styles.cartCard}>
                  <View style={styles.cartHeader}>
                    <Text style={styles.cartTitle}>
                      {t('sales.cart')} · {getItemCount()}
                    </Text>
                    <MoneyText amount={getTotal()} size={17} weight="800" color={colors.ink} />
                  </View>
                  {cart.map((item) => (
                    <CartLine
                      key={item.product.id}
                      item={item}
                      onRemove={() => removeFromCart(item.product.id)}
                      onQuantityChange={(qty) => updateCartItemQuantity(item.product.id, qty)}
                      onPriceChange={(price) => updateCartItemPrice(item.product.id, price)}
                    />
                  ))}
                </View>
              ) : null}

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
            <ProductCard product={item} compact onPress={() => addToCart(item)} />
          )}
        />
      )}

      {tab === 'new' && cart.length > 0 ? (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={styles.bottomTotal}>
            <View>
              <Text style={styles.bottomLabel}>{t('sales.total')}</Text>
              <Text style={styles.bottomCount}>{getItemCount()} {t('sales.items')}</Text>
            </View>
            <MoneyText amount={getTotal()} size={26} weight="800" color={colors.ink} />
          </View>
          <Button variant="primary" size="lg" fullWidth onPress={startCheckout}>
            {t('sales.completeSale')}
          </Button>
        </View>
      ) : null}

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
    const stock = item.product.current_stock;
    const next = stock != null ? Math.min(parsed, Math.max(1, stock)) : parsed;
    onQuantityChange(next);
    setQtyText(String(next));
  };

  const commitPrice = () => {
    const parsed = parseInt(priceText.replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
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
              onPress={() => onQuantityChange(item.quantity + 1)}
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
}: {
  sales: Array<{ id: string; reference_number: string | null; total_amount: number; payment_status: string; customer_id: string | null; created_at: string }>;
  loading: boolean;
  customerNameOf: (id: string | null) => string;
}) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

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
          expanded={expandedId === item.id}
          onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
        />
      )}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
    />
  );
}

function SaleHistoryRow({
  sale,
  customerName,
  expanded,
  onToggle,
}: {
  sale: { id: string; reference_number: string | null; total_amount: number; payment_status: string };
  customerName: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { data: items } = useSaleItems(expanded ? sale.id : null);
  const tone = sale.payment_status === 'paid' ? 'success' : sale.payment_status === 'credit' ? 'warning' : 'neutral';
  return (
    <TouchableOpacity style={styles.historyCard} onPress={onToggle} activeOpacity={0.8}>
      <View style={styles.historyTop}>
        <View style={styles.historyInfo}>
          <Text style={styles.historyRef} numberOfLines={1}>{sale.reference_number ?? sale.id.slice(0, 8)}</Text>
          <Text style={styles.historySub}>{customerName}</Text>
        </View>
        <View style={styles.historyRight}>
          <MoneyText amount={sale.total_amount} size={16} weight="800" color={colors.ink} />
          <StatusBadge label={sale.payment_status} tone={tone} />
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.faint} />
      </View>
      {expanded ? (
        <View style={styles.historyItems}>
          {(items ?? []).map((it) => (
            <View key={it.id} style={styles.historyItem}>
              <Text style={styles.historyItemQty}>×{it.quantity}</Text>
              <Text style={styles.historyItemTotal}>{it.total_amount.toLocaleString()} RWF</Text>
            </View>
          ))}
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
  clearButton: {
    padding: spacing.sm,
  },
  searchWrap: {
    marginBottom: spacing.sm,
  },
  tabWrap: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  cartCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    padding: spacing.lg,
    ...shadows.card,
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cartTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
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
    paddingBottom: 190,
  },
  skel: {
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  bottomBar: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  bottomTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    justifyContent: 'space-between',
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

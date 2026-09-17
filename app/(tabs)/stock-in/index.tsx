import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { ProductCard } from '@/components/ProductCard';
import { MoneyText } from '@/components/MoneyText';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { BottomSheet } from '@/components/SegmentedControl';
import { ConfirmModal } from '@/components/ConfirmModal';
import { ScreenHeader } from '@/components/ScreenHeader';
import { showToast } from '@/stores/toastStore';
import { useProducts, useSuppliers, useCreatePurchase, useCreateSupplier } from '@/hooks/useData';
import { PAYMENT_METHODS } from '@/constants';
import { Supplier } from '@/types';
import { PartyFormSheet, PartyFormData } from '@/components/PartyFormSheet';

interface PurchaseItem {
  productId: string;
  product: any;
  quantity: number;
  unitCost: number;
}

type PayMethod = 'cash' | 'mobile_money' | 'bank' | 'credit';

export default function StockInScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data: products, isLoading: productsLoading } = useProducts({ active: true });
  const { data: suppliers, refetch: refetchSuppliers } = useSuppliers();
  const createPurchaseMutation = useCreatePurchase();
  const createSupplier = useCreateSupplier();
  const [showAddSupplier, setShowAddSupplier] = React.useState(false);

  const [searchQuery, setSearchQuery] = React.useState('');
  const [liveQuery, setLiveQuery] = React.useState('');
  const [selectedSupplier, setSelectedSupplier] = React.useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = React.useState<PayMethod>('cash');
  const [referenceNumber, setReferenceNumber] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [items, setItems] = React.useState<PurchaseItem[]>([]);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [showSuppliers, setShowSuppliers] = React.useState(false);
  const [editingCostId, setEditingCostId] = React.useState<string | null>(null);
  const [editCost, setEditCost] = React.useState('');

  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchChange = (text: string) => {
    setSearchQuery(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLiveQuery(text), 250);
  };

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

  const supplier: Supplier | null = suppliers?.find((s) => s.id === selectedSupplier) ?? null;

  const addItem = (product: any) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { productId: product.id, product, quantity: 1, unitCost: product.average_cost }];
    });
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const bumpQty = (productId: string, delta: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.productId === productId ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i
      )
    );
  };

  const setQty = (productId: string, quantity: number) => {
    const next = Math.max(1, Math.floor(quantity) || 1);
    setItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, quantity: next } : i))
    );
  };

  const saveCost = (productId: string) => {
    const value = parseInt(editCost.replace(/[^\d]/g, ''), 10);
    if (!isNaN(value)) {
      setItems((prev) => prev.map((i) => (i.productId === productId ? { ...i, unitCost: value } : i)));
    }
    setEditingCostId(null);
  };

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);

  const startComplete = () => {
    if (items.length === 0) return;
    if (!selectedSupplier) {
      showToast(t('purchases.selectSupplier'), 'error');
      setShowSuppliers(true);
      return;
    }
    setShowConfirm(true);
  };

  const confirmPurchase = async () => {
    try {
      await createPurchaseMutation.mutateAsync({
        supplierId: selectedSupplier!,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitCost: item.unitCost,
        })),
        paymentMethod,
        referenceNumber: referenceNumber || undefined,
        notes: notes || undefined,
      });
      setItems([]);
      setSelectedSupplier(null);
      setReferenceNumber('');
      setNotes('');
      setShowConfirm(false);
      showToast(t('purchases.purchaseCompleted'), 'success');
    } catch (error) {
      setShowConfirm(false);
      showToast(t('purchases.purchaseFailed'), 'error');
    }
  };

  const listHeader = (
    <View>
      <View style={styles.searchWrap}>
        <SearchBar value={searchQuery} onChangeText={onSearchChange} placeholder={t('stock.searchProducts')} />
      </View>

      <View style={styles.metaCard}>
        <TouchableOpacity style={styles.supplierRow} onPress={() => setShowSuppliers(true)} activeOpacity={0.8}>
          <Ionicons name="business-outline" size={24} color={colors.primary} />
          <View style={styles.supplierInfo}>
            <Text style={styles.supplierName}>{supplier ? supplier.name : t('purchases.selectSupplier')}</Text>
            {supplier?.phone ? <Text style={styles.supplierPhone}>{supplier.phone}</Text> : null}
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.faint} />
        </TouchableOpacity>
        <View style={styles.methodRow}>
          {PAYMENT_METHODS.map((m) => {
            const active = paymentMethod === m.value;
            return (
              <TouchableOpacity
                key={m.value}
                style={[styles.method, active && styles.methodActive]}
                onPress={() => setPaymentMethod(m.value as PayMethod)}
                activeOpacity={0.8}
              >
                <Text style={[styles.methodText, active && styles.methodTextActive]}>
                  {t(`sales.${m.value === 'mobile_money' ? 'mobileMoney' : m.value}` as any)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Input
          label={t('purchases.referenceNumber')}
          placeholder={t('purchases.referenceNumberPlaceholder')}
          value={referenceNumber}
          onChangeText={setReferenceNumber}
        />
        <Input
          label={t('common.notes')}
          placeholder={t('common.notesPlaceholder')}
          value={notes}
          onChangeText={setNotes}
        />
      </View>

      {items.length > 0 ? (
        <View style={styles.itemsCard}>
          <Text style={styles.itemsTitle}>
            {t('purchases.items')} ({items.length})
          </Text>
          {items.map((item) => (
            <View key={item.productId} style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={1}>{item.product.name}</Text>
                {editingCostId === item.productId ? (
                  <View style={styles.costEdit}>
                    <TextInput
                      style={styles.costInput}
                      value={editCost}
                      onChangeText={setEditCost}
                      keyboardType="numeric"
                      autoFocus
                      onSubmitEditing={() => saveCost(item.productId)}
                    />
                    <TouchableOpacity onPress={() => saveCost(item.productId)} hitSlop={8}>
                      <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      setEditingCostId(item.productId);
                      setEditCost(String(item.unitCost));
                    }}
                  >
                    <Text style={styles.itemCost}>
                      {item.unitCost.toLocaleString()} RWF × {item.quantity}
                      {'  '}<Text style={styles.editHint}>{t('common.edit')}</Text>
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={styles.stepButton}
                  onPress={() => (item.quantity <= 1 ? removeItem(item.productId) : bumpQty(item.productId, -1))}
                  hitSlop={8}
                  accessibilityLabel={t('sales.decreaseQty')}
                >
                  <Ionicons name={item.quantity <= 1 ? 'trash-outline' : 'remove'} size={18} color={colors.primary} />
                </TouchableOpacity>
                <TextInput
                  style={styles.qtyInput}
                  value={String(item.quantity)}
                  onChangeText={(text) => {
                    const digits = text.replace(/[^\d]/g, '');
                    if (digits === '') {
                      setItems((prev) =>
                        prev.map((i) => (i.productId === item.productId ? { ...i, quantity: 1 } : i))
                      );
                      return;
                    }
                    setQty(item.productId, parseInt(digits, 10));
                  }}
                  keyboardType="number-pad"
                  selectTextOnFocus
                  accessibilityLabel={t('sales.quantity')}
                />
                <TouchableOpacity
                  style={styles.stepButton}
                  onPress={() => bumpQty(item.productId, 1)}
                  hitSlop={8}
                  accessibilityLabel={t('sales.increaseQty')}
                >
                  <Ionicons name="add" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <MoneyText amount={item.quantity * item.unitCost} size={14} weight="700" color={colors.ink} />
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.listLabel}>{t('stock.products')}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <ScreenHeader
        title={t('purchases.stockIn')}
        subtitle={`${items.length} ${t('purchases.items')}`}
        right={
          items.length > 0 ? (
            <TouchableOpacity onPress={() => setItems([])} hitSlop={12} style={styles.clearButton}>
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
            </TouchableOpacity>
          ) : null
        }
      />

      {productsLoading ? (
        <View style={styles.list}>
          {listHeader}
          <Skeleton height={76} style={styles.skel} />
          <Skeleton height={76} style={styles.skel} />
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => item.id}
          style={styles.flex}
          ListHeaderComponent={listHeader}
          renderItem={({ item }) => <ProductCard product={item} compact onPress={() => addItem(item)} />}
          contentContainerStyle={StyleSheet.flatten([
            styles.list,
            items.length > 0 ? styles.listWithBar : null,
          ])}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={<EmptyState icon="search" title={t('common.noResults')} />}
        />
      )}

      {items.length > 0 ? (
        <View style={StyleSheet.flatten([styles.bottomBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }])}>
          <View style={styles.bottomTotal}>
            <Text style={styles.bottomLabel}>{t('purchases.totalCost')}</Text>
            <MoneyText amount={subtotal} size={24} weight="800" color={colors.ink} />
          </View>
          <Button variant="primary" size="lg" fullWidth loading={createPurchaseMutation.isPending} onPress={startComplete}>
            {t('purchases.completePurchase')}
          </Button>
        </View>
      ) : null}

      <BottomSheet
        visible={showSuppliers}
        onClose={() => setShowSuppliers(false)}
        title={t('purchases.selectSupplier')}
      >
        <TouchableOpacity
          style={styles.addPartyBtn}
          onPress={() => {
            setShowSuppliers(false);
            setShowAddSupplier(true);
          }}
        >
          <Ionicons name="business-outline" size={18} color={colors.primary} />
          <Text style={styles.addPartyText}>{t('purchases.addSupplier')}</Text>
        </TouchableOpacity>
        <FlatList
          data={suppliers ?? []}
          keyExtractor={(item) => item.id}
          style={styles.supplierList}
          renderItem={({ item }) => {
            const active = selectedSupplier === item.id;
            return (
              <TouchableOpacity
                style={[styles.supplierOption, active && styles.supplierOptionActive]}
                onPress={() => {
                  setSelectedSupplier(item.id);
                  setShowSuppliers(false);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.supplierAvatar}>
                  <Text style={styles.supplierAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.supplierInfo}>
                  <Text style={styles.supplierName}>{item.name}</Text>
                  {item.phone ? <Text style={styles.supplierPhone}>{item.phone}</Text> : null}
                </View>
                {active ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={styles.emptyList}>{t('common.noResults')}</Text>}
        />
        <View style={styles.sheetSpacer} />
      </BottomSheet>

      <PartyFormSheet
        visible={showAddSupplier}
        onClose={() => setShowAddSupplier(false)}
        kind="supplier"
        showCreditLimit={false}
        saving={createSupplier.isPending}
        onSubmit={async (form: PartyFormData) => {
          try {
            const created = await createSupplier.mutateAsync({
              name: form.name,
              phone: form.phone,
              email: form.email,
              address: form.address,
            });
            setSelectedSupplier(created.id);
            setShowAddSupplier(false);
            await refetchSuppliers();
            showToast(t('suppliers.supplierAdded'), 'success');
          } catch {
            showToast(t('suppliers.supplierFailed'), 'error');
          }
        }}
      />

      <ConfirmModal
        visible={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={confirmPurchase}
        title={t('purchases.completePurchase')}
        message={`${supplier?.name ?? ''} · ${subtotal.toLocaleString()} RWF`}
        confirmText={t('purchases.completePurchase')}
      />
    </KeyboardAvoidingView>
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
  clearButton: {
    padding: spacing.sm,
  },
  searchWrap: {
    marginBottom: spacing.sm,
  },
  metaCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  supplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
  },
  supplierInfo: {
    flex: 1,
  },
  supplierName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  supplierPhone: {
    fontSize: 13,
    color: colors.muted,
  },
  methodRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  method: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  methodActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  methodText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    textAlign: 'center',
  },
  methodTextActive: {
    color: colors.primaryText,
  },
  itemsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    padding: spacing.lg,
    ...shadows.card,
  },
  itemsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    gap: spacing.sm,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  itemCost: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  editHint: {
    color: colors.primary,
    fontWeight: '700',
  },
  costEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 4,
  },
  costInput: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: 14,
    minWidth: 110,
    color: colors.ink,
    backgroundColor: colors.card,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.full,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  stepButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyInput: {
    minWidth: 40,
    maxWidth: 64,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontVariant: ['tabular-nums'],
  },
  stepQty: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    minWidth: 24,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  listLabel: {
    paddingVertical: spacing.sm,
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  listWithBar: {
    paddingBottom: spacing.md,
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
    fontSize: 14,
    color: colors.muted,
  },
  supplierList: {
    maxHeight: 340,
  },
  addPartyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    marginBottom: 8,
  },
  addPartyText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  supplierOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    gap: spacing.md,
    minHeight: 60,
  },
  supplierOptionActive: {
    backgroundColor: colors.primarySoft,
  },
  supplierAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplierAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },
  emptyList: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  sheetSpacer: {
    height: spacing.lg,
  },
});

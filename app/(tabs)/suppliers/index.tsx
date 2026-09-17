import React from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme/tokens';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { PartyFormSheet, PartyFormData } from '@/components/PartyFormSheet';
import { ConfirmModal } from '@/components/ConfirmModal';
import { SearchBar } from '@/components/SearchBar';
import { showToast } from '@/stores/toastStore';
import {
  useSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
  useDeleteSupplier,
} from '@/hooks/useData';
import { Supplier } from '@/types';

export default function SuppliersScreen() {
  const { t } = useTranslation();
  const { data: suppliers, isLoading, refetch, isRefetching } = useSuppliers();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const deleteSupplier = useDeleteSupplier();

  const [search, setSearch] = React.useState('');
  const [refreshing, setRefreshing] = React.useState(false);
  const [showForm, setShowForm] = React.useState(false);
  const [editing, setEditing] = React.useState<Supplier | null>(null);
  const [deleting, setDeleting] = React.useState<Supplier | null>(null);

  const filtered = React.useMemo(() => {
    const list = suppliers ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.phone?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q)
    );
  }, [suppliers, search]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (supplier: Supplier) => {
    setEditing(supplier);
    setShowForm(true);
  };

  const handleSubmit = async (form: PartyFormData) => {
    try {
      if (editing) {
        await updateSupplier.mutateAsync({
          id: editing.id,
          updates: {
            name: form.name,
            phone: form.phone || null,
            email: form.email || null,
            address: form.address || null,
          },
        });
        showToast(t('suppliers.supplierUpdated'), 'success');
      } else {
        await createSupplier.mutateAsync({
          name: form.name,
          phone: form.phone,
          email: form.email,
          address: form.address,
        });
        showToast(t('suppliers.supplierAdded'), 'success');
      }
      setShowForm(false);
      setEditing(null);
      await refetch();
    } catch {
      showToast(t('suppliers.supplierFailed'), 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteSupplier.mutateAsync(deleting.id);
      showToast(t('suppliers.supplierDeleted'), 'success');
      setDeleting(null);
      await refetch();
    } catch {
      showToast(t('suppliers.supplierFailed'), 'error');
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('suppliers.suppliers')}
        right={
          <TouchableOpacity onPress={openCreate} hitSlop={10} accessibilityLabel={t('suppliers.addSupplier')}>
            <Ionicons name="add-circle" size={28} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      <View style={styles.searchWrap}>
        <SearchBar
          value={search}
          onChangeText={setSearch}
          placeholder={t('suppliers.searchSuppliers')}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing || !!isRefetching} onRefresh={onRefresh} />}
        ListEmptyComponent={
          isLoading ? (
            <View>
              <Skeleton height={68} style={styles.skel} />
              <Skeleton height={68} style={styles.skel} />
            </View>
          ) : (
            <EmptyState
              icon="business-outline"
              title={t('suppliers.noSuppliers')}
              message={t('suppliers.addFirstSupplier')}
            />
          )
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <TouchableOpacity
              style={styles.rowMain}
              onPress={() =>
                router.push({
                  pathname: '/payment/supplier-payment',
                  params: { supplierId: item.id },
                } as any)
              }
              activeOpacity={0.8}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                {item.phone ? <Text style={styles.sub}>{item.phone}</Text> : null}
                {item.email ? <Text style={styles.sub}>{item.email}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.faint} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(item)} hitSlop={8}>
              <Ionicons name="create-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setDeleting(item)} hitSlop={8}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
          </View>
        )}
      />

      <FloatingActionButton
        mainColor={colors.primary}
        tooltip={t('suppliers.addSupplier')}
        actions={[
          {
            label: t('suppliers.addSupplier'),
            icon: 'business-outline',
            onPress: openCreate,
            variant: 'primary',
          },
        ]}
      />

      <PartyFormSheet
        visible={showForm}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
        kind="supplier"
        mode={editing ? 'edit' : 'create'}
        showCreditLimit={false}
        initial={
          editing
            ? {
                name: editing.name,
                phone: editing.phone ?? '',
                email: editing.email ?? '',
                address: editing.address ?? '',
              }
            : null
        }
        saving={createSupplier.isPending || updateSupplier.isPending}
        onSubmit={handleSubmit}
      />

      <ConfirmModal
        visible={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
        title={t('suppliers.deleteSupplier')}
        message={t('suppliers.deleteSupplierConfirm')}
        confirmText={t('common.delete')}
        variant="danger"
        loading={deleteSupplier.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchWrap: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 110,
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
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    marginBottom: spacing.sm,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
  sub: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

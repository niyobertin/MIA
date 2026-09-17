import React from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing, shadows } from '@/theme/tokens';
import { MoneyText } from '@/components/MoneyText';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { ScreenHeader } from '@/components/ScreenHeader';
import { FloatingActionButton } from '@/components/FloatingActionButton';
import { PartyFormSheet, PartyFormData } from '@/components/PartyFormSheet';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showToast } from '@/stores/toastStore';
import {
  useCustomersWithBalances,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
} from '@/hooks/useData';
import { Customer } from '@/types';

export default function CustomersScreen() {
  const { t } = useTranslation();
  const { data, isLoading, refetch, isRefetching } = useCustomersWithBalances();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();

  const [refreshing, setRefreshing] = React.useState(false);
  const [showForm, setShowForm] = React.useState(false);
  const [editing, setEditing] = React.useState<Customer | null>(null);
  const [deleting, setDeleting] = React.useState<Customer | null>(null);

  const rows = data?.rows ?? [];

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (customer: Customer) => {
    setEditing(customer);
    setShowForm(true);
  };

  const handleSubmit = async (form: PartyFormData) => {
    try {
      if (editing) {
        await updateCustomer.mutateAsync({
          id: editing.id,
          updates: {
            name: form.name,
            phone: form.phone || null,
            email: form.email || null,
            address: form.address || null,
            credit_limit: form.credit_limit ?? 0,
          },
        });
        showToast(t('customers.customerUpdated'), 'success');
      } else {
        await createCustomer.mutateAsync({
          name: form.name,
          phone: form.phone,
          email: form.email,
          address: form.address,
          credit_limit: form.credit_limit,
        });
        showToast(t('customers.customerAdded'), 'success');
      }
      setShowForm(false);
      setEditing(null);
      await refetch();
    } catch {
      showToast(t('customers.customerFailed'), 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteCustomer.mutateAsync(deleting.id);
      showToast(t('customers.customerDeleted'), 'success');
      setDeleting(null);
      await refetch();
    } catch {
      showToast(t('customers.customerFailed'), 'error');
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={t('customers.customers')}
        right={
          <TouchableOpacity onPress={openCreate} hitSlop={10} accessibilityLabel={t('customers.addCustomer')}>
            <Ionicons name="add-circle" size={28} color={colors.primary} />
          </TouchableOpacity>
        }
      />

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
              message={t('customers.addFirstCustomer')}
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
            <View style={styles.row}>
              <TouchableOpacity
                style={styles.rowMain}
                onPress={() =>
                  router.push({
                    pathname: '/payment/customer-payment',
                    params: { customerId: item.customer.id },
                  } as any)
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
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(item.customer)} hitSlop={8}>
                <Ionicons name="create-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={() => setDeleting(item.customer)} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </TouchableOpacity>
            </View>
          );
        }}
      />

      <FloatingActionButton
        mainColor={colors.primary}
        tooltip={t('customers.addCustomer')}
        actions={[
          {
            label: t('customers.addCustomer'),
            icon: 'person-add-outline',
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
        kind="customer"
        mode={editing ? 'edit' : 'create'}
        initial={
          editing
            ? {
                name: editing.name,
                phone: editing.phone ?? '',
                email: editing.email ?? '',
                address: editing.address ?? '',
                credit_limit: editing.credit_limit,
              }
            : null
        }
        saving={createCustomer.isPending || updateCustomer.isPending}
        onSubmit={handleSubmit}
      />

      <ConfirmModal
        visible={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
        title={t('customers.deleteCustomer')}
        message={t('customers.deleteCustomerConfirm')}
        confirmText={t('common.delete')}
        variant="danger"
        loading={deleteCustomer.isPending}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
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
    paddingVertical: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    marginBottom: spacing.sm,
    gap: 2,
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
  phone: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

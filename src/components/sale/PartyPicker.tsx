import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '@/theme/tokens';
import { BottomSheet } from '@/components/SegmentedControl';
import { Customer, User } from '@/types';

export function CustomerPicker({
  visible,
  onClose,
  customers,
  selectedId,
  onSelect,
  onAddNew,
}: {
  visible: boolean;
  onClose: () => void;
  customers: Customer[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddNew: () => void;
}) {
  const { t } = useTranslation();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('sales.selectCustomer')}>
      <TouchableOpacity style={styles.add} onPress={onAddNew} accessibilityRole="button">
        <Ionicons name="person-add-outline" size={20} color={colors.primary} />
        <Text style={styles.addText}>{t('customers.addCustomer')}</Text>
      </TouchableOpacity>
      <Option
        avatar={<Ionicons name="walk-outline" size={22} color={colors.ink} />}
        muted
        title={t('customers.walkInCustomer')}
        active={!selectedId}
        onPress={() => onSelect(null)}
      />
      <FlatList
        data={customers}
        keyExtractor={(item) => item.id}
        style={styles.list}
        renderItem={({ item }) => (
          <Option
            avatar={<Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>}
            title={item.name}
            subtitle={item.phone ?? undefined}
            active={selectedId === item.id}
            onPress={() => onSelect(item.id)}
          />
        )}
        ListEmptyComponent={<Text style={styles.empty}>{t('common.noCustomers')}</Text>}
      />
      <View style={styles.spacer} />
    </BottomSheet>
  );
}

export function WaiterPicker({
  visible,
  onClose,
  waiters,
  selectedId,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  waiters: User[];
  selectedId: string | null;
  onSelect: (waiter: User) => void;
}) {
  const { t } = useTranslation();
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('sales.selectWaiter')}>
      {waiters.length === 0 ? (
        <Text style={styles.empty}>{t('waiterTabs.noWaiters')}</Text>
      ) : (
        <FlatList
          data={waiters}
          keyExtractor={(item) => item.id}
          style={styles.list}
          renderItem={({ item }) => (
            <Option
              avatar={<Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>}
              title={item.name}
              subtitle={item.role ? t(`users.${item.role.toLowerCase()}` as 'users.staff') : undefined}
              active={selectedId === item.id}
              onPress={() => onSelect(item)}
            />
          )}
        />
      )}
      <View style={styles.spacer} />
    </BottomSheet>
  );
}

function Option({
  avatar,
  title,
  subtitle,
  active,
  muted,
  onPress,
}: {
  avatar: React.ReactNode;
  title: string;
  subtitle?: string;
  active: boolean;
  muted?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.option, active && styles.optionActive]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
    >
      <View style={[styles.avatar, muted && styles.avatarMuted]}>{avatar}</View>
      <View style={styles.info}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {active ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  add: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, marginBottom: spacing.xs },
  addText: { fontSize: 16, fontWeight: '700', color: colors.primary },
  list: { maxHeight: 320 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    gap: spacing.md,
    minHeight: 60,
  },
  optionActive: { backgroundColor: colors.primarySoft },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMuted: { backgroundColor: colors.borderSoft },
  avatarText: { fontSize: 18, fontWeight: '800', color: colors.primary },
  info: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600', color: colors.ink },
  subtitle: { fontSize: 14, color: colors.muted },
  empty: { fontSize: 15, color: colors.muted, textAlign: 'center', paddingVertical: spacing.xl },
  spacer: { height: spacing.lg },
});

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme/tokens';
import { BottomSheet, afterSheetCloses } from '@/components/SegmentedControl';

export type RowAction = {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  tone?: 'danger';
  hidden?: boolean;
  disabled?: boolean;
};

export function RowActionMenu({ title, actions }: { title: string; actions: RowAction[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const visible = actions.filter((action) => !action.hidden);
  if (visible.length === 0) return null;

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${t('common.actions')}: ${title}`}
      >
        <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
      </TouchableOpacity>
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={title}>
        <View style={styles.list}>
          {visible.map((action) => {
            const color = action.tone === 'danger' ? colors.danger : colors.ink;
            return (
              <TouchableOpacity
                key={action.label}
                style={StyleSheet.flatten([styles.item, action.disabled ? styles.itemDisabled : null])}
                disabled={action.disabled}
                onPress={() => {
                  setOpen(false);
                  afterSheetCloses(action.onPress);
                }}
                accessibilityRole="button"
                activeOpacity={0.8}
              >
                <Ionicons name={action.icon} size={20} color={color} />
                <Text style={StyleSheet.flatten([styles.label, { color }])}>{action.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.spacer} />
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  list: { gap: spacing.xs, marginTop: spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.inputBg },
  itemDisabled: { opacity: 0.5 },
  label: { fontSize: 16, fontWeight: '600' },
  spacer: { height: spacing.lg },
});

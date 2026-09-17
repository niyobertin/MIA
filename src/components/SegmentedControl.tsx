import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme/tokens';

interface SegmentedControlProps<T extends string> {
  options: Array<{ value: T; label: string; icon?: string }>;
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <View style={styles.container} accessibilityRole="tablist">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.option, active && styles.optionActive]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            {opt.icon ? (
              <Ionicons
                name={opt.icon as any}
                size={18}
                color={active ? colors.white : colors.muted}
                style={styles.icon}
              />
            ) : null}
            <Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({ visible, onClose, title, children }) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          {title ? <Text style={styles.sheetTitle}>{title}</Text> : <View />}
          <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.closeButton} accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={22} color={colors.muted} />
          </TouchableOpacity>
        </View>
        {children}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.borderSoft,
    borderRadius: radius.md,
    padding: 4,
  },
  option: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.sm,
    minHeight: 44,
  },
  optionActive: {
    backgroundColor: colors.card,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  icon: {
    marginRight: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  labelActive: {
    color: colors.ink,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    maxHeight: '88%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  closeButton: {
    padding: 6,
  },
});

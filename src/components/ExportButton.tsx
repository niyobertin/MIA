import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius, spacing } from '@/theme/tokens';
import { BottomSheet, afterSheetCloses } from '@/components/SegmentedControl';
import { showToast } from '@/stores/toastStore';
import { exportList, type ExportFormat, type ListExport } from '@/utils/listExport';
import { useAuthStore } from '@/stores/authStore';

export function ExportButton({
  build,
  run: runCustom,
  disabled = false,
  renderTrigger,
}: {
  build?: () => ListExport;
  run?: (format: ExportFormat) => Promise<void>;
  disabled?: boolean;
  renderTrigger?: (open: () => void, busy: boolean) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<ExportFormat | null>(null);
  const business = useAuthStore((state) => state.business);

  const run = async (format: ExportFormat) => {
    setOpen(false);
    setBusy(format);
    await new Promise<void>((resolve) => afterSheetCloses(resolve));
    try {
      if (runCustom) {
        await runCustom(format);
        return;
      }
      const data = build?.();
      if (!data || data.rows.length === 0) {
        showToast(t('common.exportEmpty'), 'warning');
        return;
      }
      await exportList(format, { businessName: business?.name ?? 'MIA', currency: business?.currency ?? 'RWF', ...data });
    } catch {
      showToast(t('common.exportFailed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const options: { format: ExportFormat; icon: React.ComponentProps<typeof Ionicons>['name']; color: string; label: string; hint: string }[] = [
    { format: 'pdf', icon: 'document-text-outline', color: colors.danger, label: t('common.exportPdf'), hint: t('common.exportPdfHint') },
    { format: 'xlsx', icon: 'grid-outline', color: colors.success, label: t('common.exportExcel'), hint: t('common.exportExcelHint') },
  ];

  return (
    <>
      {renderTrigger ? renderTrigger(() => setOpen(true), busy !== null) : (
      <TouchableOpacity
        style={StyleSheet.flatten([styles.button, disabled || busy ? styles.disabled : null])}
        onPress={() => setOpen(true)}
        disabled={disabled || busy !== null}
        accessibilityRole="button"
        accessibilityLabel={t('common.export')}
        activeOpacity={0.8}
      >
        {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="download-outline" size={16} color={colors.primary} />}
        <Text style={styles.buttonText}>{t('common.export')}</Text>
      </TouchableOpacity>
      )}
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={t('common.export')}>
        <View style={styles.options}>
          {options.map((option) => (
            <TouchableOpacity key={option.format} style={styles.option} onPress={() => void run(option.format)} accessibilityRole="button" activeOpacity={0.8}>
              <View style={styles.optionIcon}>
                <Ionicons name={option.icon} size={22} color={option.color} />
              </View>
              <View style={styles.optionInfo}>
                <Text style={styles.optionLabel}>{option.label}</Text>
                <Text style={styles.optionHint}>{option.hint}</Text>
              </View>
              <Ionicons name="share-outline" size={18} color={colors.faint} />
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.spacer} />
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  disabled: { opacity: 0.5 },
  buttonText: { fontSize: 14, fontWeight: '600', color: colors.primaryText },
  options: { gap: spacing.sm, marginTop: spacing.sm },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 64, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.inputBg, gap: spacing.md },
  optionIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  optionInfo: { flex: 1 },
  optionLabel: { fontSize: 16, fontWeight: '700', color: colors.ink },
  optionHint: { fontSize: 13, color: colors.muted, marginTop: 2 },
  spacer: { height: spacing.lg },
});

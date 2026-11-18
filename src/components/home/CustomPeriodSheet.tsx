import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { spacing } from '@/theme/tokens';
import { BottomSheet } from '@/components/SegmentedControl';
import { Button } from '@/components/Button';
import { DatePickerField } from '@/components/DatePickerField';
import { getTodayDateString } from '@/utils/formatters';
import { showToast } from '@/stores/toastStore';

export function CustomPeriodSheet({
  visible,
  onClose,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  onApply: (start: string, end: string) => void;
}) {
  const { t } = useTranslation();
  const today = getTodayDateString();
  const [startDate, setStartDate] = React.useState(today);
  const [endDate, setEndDate] = React.useState(today);

  const apply = () => {
    if (startDate > endDate) {
      showToast(t('reports.invalidRange'), 'error');
      return;
    }
    onApply(startDate, endDate);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('reports.customRange')}>
      <View style={styles.body}>
        <View style={styles.row}>
          <DatePickerField label={t('reports.startDate')} value={startDate} onChange={setStartDate} maxDate={today} />
          <DatePickerField label={t('reports.endDate')} value={endDate} onChange={setEndDate} maxDate={today} />
        </View>
        <Button variant="primary" size="lg" fullWidth onPress={apply}>
          {t('reports.applyRange')}
        </Button>
      </View>
      <View style={styles.spacer} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: spacing.md, gap: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md },
  spacer: { height: spacing.lg },
});

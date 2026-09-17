import React from 'react';
import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { colors, spacing } from '@/theme/tokens';
import { Button } from './Button';
import { FormInput } from './FormInput';
import { FormPicker } from './FormPicker';
import { BottomSheet } from './SegmentedControl';
import { Picker } from '@react-native-picker/picker';

export const AddProductSheet: React.FC<AddProductSheetProps> = ({
  visible,
  onClose,
  categories,
  onSubmit,
  saving,
}) => {
  const { t } = useTranslation();
  const schema = React.useMemo(
    () =>
      z.object({
        name: z.string().min(1, t('stock.productNameRequired')),
        sku: z.string().optional(),
        barcode: z.string().optional(),
        category_id: z.string().optional(),
        unit: z.string(),
        selling_price: z.number().int().nonnegative(),
        average_cost: z.number().int().nonnegative(),
        reorder_level: z.number().int().nonnegative(),
        track_inventory: z.boolean(),
      }),
    [t]
  );
  const { control, handleSubmit, reset } = useForm<AddProductData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      sku: '',
      barcode: '',
      category_id: '',
      unit: 'pcs',
      selling_price: 0,
      average_cost: 0,
      reorder_level: 0,
      track_inventory: true,
    },
  });

  const submit = async (data: AddProductData) => {
    await onSubmit(data);
    reset();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('stock.addProduct')}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.form}>
          <View style={styles.intro}>
            <Text style={styles.introTitle}>{t('stock.addProductTitle')}</Text>
            <Text style={styles.introBody}>{t('stock.addProductHint')}</Text>
          </View>
          <FormInput control={control} name="name" label={t('stock.productName')} required />
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <FormInput control={control} name="selling_price" label={t('stock.sellingPrice')} keyboardType="numeric" parseValue={(v) => parseInt(v.replace(/[^\d]/g, ''), 10) || 0} />
            </View>
            <View style={styles.rowItem}>
              <FormInput control={control} name="average_cost" label={t('stock.averageCost')} keyboardType="numeric" parseValue={(v) => parseInt(v.replace(/[^\d]/g, ''), 10) || 0} />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <FormInput control={control} name="sku" label={t('stock.sku')} />
            </View>
            <View style={styles.rowItem}>
              <FormInput control={control} name="unit" label={t('stock.unit')} />
            </View>
          </View>
          <FormPicker control={control} name="category_id" label={t('stock.category')}>
            <Picker.Item label={t('common.select')} value="" />
            {categories.map((c) => (
              <Picker.Item key={c.id} label={c.name} value={c.id} />
            ))}
          </FormPicker>
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <FormInput control={control} name="barcode" label={t('stock.barcode')} />
            </View>
            <View style={styles.rowItem}>
              <FormInput control={control} name="reorder_level" label={t('stock.reorderLevel')} keyboardType="numeric" parseValue={(v) => parseInt(v, 10) || 0} />
            </View>
          </View>
          <View style={styles.trackRow}>
            <Controller
              control={control}
              name="track_inventory"
              render={({ field }) => (
                <Switch
                  value={field.value}
                  onValueChange={field.onChange}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#fff"
                />
              )}
            />
            <Text style={styles.trackLabel}>{t('stock.trackInventory')}</Text>
          </View>
          <Button variant="primary" size="lg" fullWidth loading={saving} onPress={() => handleSubmit(submit)()}>
            {t('common.save')}
          </Button>
          <View style={styles.spacer} />
        </View>
      </ScrollView>
    </BottomSheet>
  );
};

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
  },
  intro: {
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  introTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.primaryText,
  },
  introBody: {
    fontSize: 13,
    color: colors.primaryText,
    marginTop: 4,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rowItem: {
    flex: 1,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  trackLabel: {
    fontSize: 14,
    color: colors.body,
  },
  spacer: {
    height: spacing.lg,
  },
});

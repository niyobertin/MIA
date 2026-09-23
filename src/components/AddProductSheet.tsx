import React from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { colors, spacing, radius } from '@/theme/tokens';
import { Button } from './Button';
import { FormInput } from './FormInput';
import { FormPicker } from './FormPicker';
import { Input } from './Input';
import { BottomSheet } from './SegmentedControl';
import { Picker } from '@react-native-picker/picker';
import { Category, Product } from '@/types';

export type AddProductData = {
  name: string;
  sku?: string;
  barcode?: string;
  category_id?: string;
  unit: string;
  selling_price: number;
  average_cost: number;
  reorder_level: number;
  track_inventory: boolean;
};

type AddProductSheetProps = {
  visible: boolean;
  onClose: () => void;
  categories: Category[];
  onSubmit: (data: AddProductData) => Promise<void> | void;
  onCreateCategory?: (name: string) => Promise<Category | void> | Category | void;
  saving?: boolean;
  mode?: 'create' | 'edit';
  initialProduct?: Product | null;
  lockCost?: boolean;
};

export const AddProductSheet: React.FC<AddProductSheetProps> = ({
  visible,
  onClose,
  categories,
  onSubmit,
  onCreateCategory,
  saving,
  mode = 'create',
  initialProduct,
  lockCost = false,
}) => {
  const { t } = useTranslation();
  const [showNewCategory, setShowNewCategory] = React.useState(false);
  const [newCategoryName, setNewCategoryName] = React.useState('');
  const [creatingCategory, setCreatingCategory] = React.useState(false);

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
  const { control, handleSubmit, reset, setValue } = useForm<AddProductData>({
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

  React.useEffect(() => {
    if (!visible) return;
    if (mode === 'edit' && initialProduct) {
      reset({
        name: initialProduct.name,
        sku: initialProduct.sku ?? '',
        barcode: initialProduct.barcode ?? '',
        category_id: initialProduct.category_id ?? '',
        unit: initialProduct.unit || 'pcs',
        selling_price: initialProduct.selling_price,
        average_cost: initialProduct.average_cost,
        reorder_level: initialProduct.reorder_level,
        track_inventory: !!initialProduct.track_inventory,
      });
    } else {
      reset({
        name: '',
        sku: '',
        barcode: '',
        category_id: '',
        unit: 'pcs',
        selling_price: 0,
        average_cost: 0,
        reorder_level: 0,
        track_inventory: true,
      });
    }
    setShowNewCategory(false);
    setNewCategoryName('');
  }, [visible, mode, initialProduct, reset]);

  const submit = async (data: AddProductData) => {
    await onSubmit(data);
    if (mode === 'create') reset();
  };

  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || !onCreateCategory) return;
    setCreatingCategory(true);
    try {
      const created = await onCreateCategory(name);
      if (created?.id) setValue('category_id', created.id);
      setShowNewCategory(false);
      setNewCategoryName('');
    } finally {
      setCreatingCategory(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={mode === 'edit' ? t('stock.editProduct') : t('stock.addProduct')}
    >
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.form}>
          {mode === 'create' ? (
            <View style={styles.intro}>
              <Text style={styles.introTitle}>{t('stock.addProductTitle')}</Text>
              <Text style={styles.introBody}>{t('stock.addProductHint')}</Text>
            </View>
          ) : null}
          <FormInput control={control} name="name" label={t('stock.productName')} required />
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <FormInput
                control={control}
                name="selling_price"
                label={t('stock.sellingPrice')}
                keyboardType="numeric"
                parseValue={(v) => parseInt(v.replace(/[^\d]/g, ''), 10) || 0}
              />
            </View>
            <View style={styles.rowItem}>
              <FormInput
                control={control}
                name="average_cost"
                label={t('stock.costPrice')}
                keyboardType="numeric"
                parseValue={(v) => parseInt(v.replace(/[^\d]/g, ''), 10) || 0}
                disabled={lockCost}
                helperText={lockCost ? t('stock.costLocked') : undefined}
              />
            </View>
          </View>
          {mode === 'create' ? (
            <View style={styles.priceHelp}>
              <Text style={styles.priceHelpTitle}>{t('stock.priceHelpTitle')}</Text>
              <Text style={styles.priceHelpBody}>{t('stock.sellingPriceHelp')}</Text>
              <Text style={styles.priceHelpBody}>{t('stock.costPriceHelp')}</Text>
              <Text style={styles.priceHelpBody}>{t('stock.averageCostHelp')}</Text>
            </View>
          ) : null}
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
          {onCreateCategory ? (
            showNewCategory ? (
              <View style={styles.newCategory}>
                <Input
                  label={t('stock.newCategory')}
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                  placeholder={t('stock.categoryNamePlaceholder')}
                />
                <View style={styles.categoryActions}>
                  <Button variant="ghost" onPress={() => setShowNewCategory(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    variant="secondary"
                    loading={creatingCategory}
                    onPress={() => void handleCreateCategory()}
                  >
                    {t('common.add')}
                  </Button>
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setShowNewCategory(true)}>
                <Text style={styles.addCategoryLink}>{t('stock.addCategory')}</Text>
              </TouchableOpacity>
            )
          ) : null}
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <FormInput control={control} name="barcode" label={t('stock.barcode')} />
            </View>
            <View style={styles.rowItem}>
              <FormInput
                control={control}
                name="reorder_level"
                label={t('stock.reorderLevel')}
                keyboardType="numeric"
                parseValue={(v) => parseInt(v, 10) || 0}
              />
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
            {mode === 'edit' ? t('common.update') : t('common.save')}
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
  priceHelp: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6,
  },
  priceHelpTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 2,
  },
  priceHelpBody: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
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
  addCategoryLink: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  newCategory: {
    gap: spacing.sm,
  },
  categoryActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  spacer: {
    height: spacing.lg,
  },
});

import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { spacing } from '@/theme/tokens';
import { Button } from './Button';
import { FormInput } from './FormInput';
import { BottomSheet } from './SegmentedControl';

export type PartyFormData = {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  credit_limit?: number;
};

type PartyFormSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: PartyFormData) => Promise<void> | void;
  saving?: boolean;
  mode?: 'create' | 'edit';
  kind: 'customer' | 'supplier';
  initial?: Partial<PartyFormData> | null;
  showCreditLimit?: boolean;
};

export const PartyFormSheet: React.FC<PartyFormSheetProps> = ({
  visible,
  onClose,
  onSubmit,
  saving,
  mode = 'create',
  kind,
  initial,
  showCreditLimit = kind === 'customer',
}) => {
  const { t } = useTranslation();
  const schema = React.useMemo(
    () =>
      z.object({
        name: z.string().min(1, t('common.required')),
        phone: z.string().optional(),
        email: z.string().email(t('common.error')).optional().or(z.literal('')),
        address: z.string().optional(),
        credit_limit: z.number().int().nonnegative().optional(),
      }),
    [t]
  );

  const { control, handleSubmit, reset } = useForm<PartyFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      address: '',
      credit_limit: 0,
    },
  });

  React.useEffect(() => {
    if (!visible) return;
    reset({
      name: initial?.name ?? '',
      phone: initial?.phone ?? '',
      email: initial?.email ?? '',
      address: initial?.address ?? '',
      credit_limit: initial?.credit_limit ?? 0,
    });
  }, [visible, initial, reset]);

  const title =
    mode === 'edit'
      ? kind === 'customer'
        ? t('customers.editCustomer')
        : t('suppliers.editSupplier')
      : kind === 'customer'
        ? t('customers.addCustomer')
        : t('suppliers.addSupplier');

  const submit = async (data: PartyFormData) => {
    await onSubmit(data);
    if (mode === 'create') reset();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.form}>
          <FormInput control={control} name="name" label={t('auth.name')} required />
          <FormInput control={control} name="phone" label={t('auth.phone')} keyboardType="phone-pad" />
          <FormInput control={control} name="email" label={t('auth.email')} keyboardType="email-address" autoCapitalize="none" />
          <FormInput control={control} name="address" label={t('customers.address')} />
          {showCreditLimit ? (
            <FormInput
              control={control}
              name="credit_limit"
              label={t('customers.creditLimit')}
              keyboardType="numeric"
              parseValue={(v) => parseInt(v.replace(/[^\d]/g, ''), 10) || 0}
            />
          ) : null}
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
  spacer: {
    height: spacing.lg,
  },
});

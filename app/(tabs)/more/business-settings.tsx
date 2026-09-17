import { FormScrollView } from '@/components';
import { FormInput, FormPicker } from '@/components';
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { Input, Button } from '@/components';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { businessRepository } from '@/repositories/business/business';
import { showToast } from '@/stores/toastStore';

const businessSettingsSchema = z.object({
  name: z.string().min(2, 'Business name must be at least 2 characters'),
  currency: z.string(),
  country: z.string(),
  timezone: z.string(),
});

type BusinessSettingsForm = z.infer<typeof businessSettingsSchema>;

const CURRENCIES = [
  { value: 'RWF', label: 'RWF - Rwandan Franc' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'KES', label: 'KES - Kenyan Shilling' },
  { value: 'UGX', label: 'UGX - Ugandan Shilling' },
  { value: 'TZS', label: 'TZS - Tanzanian Shilling' },
];

const COUNTRIES = [
  { value: 'Rwanda', label: 'Rwanda' },
  { value: 'Kenya', label: 'Kenya' },
  { value: 'Uganda', label: 'Uganda' },
  { value: 'Tanzania', label: 'Tanzania' },
  { value: 'Burundi', label: 'Burundi' },
  { value: 'DR Congo', label: 'DR Congo' },
];

const TIMEZONES = [
  { value: 'Africa/Kigali', label: 'Africa/Kigali (UTC+2)' },
  { value: 'Africa/Nairobi', label: 'Africa/Nairobi (UTC+3)' },
  { value: 'Africa/Kampala', label: 'Africa/Kampala (UTC+3)' },
  { value: 'Africa/Dar_es_Salaam', label: 'Africa/Dar_es_Salaam (UTC+3)' },
  { value: 'Africa/Bujumbura', label: 'Africa/Bujumbura (UTC+2)' },
  { value: 'Africa/Kinshasa', label: 'Africa/Kinshasa (UTC+1)' },
];

export default function BusinessSettingsScreen() {
  const { t } = useTranslation();
  const { business } = useAuthStore();
  const { control, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<BusinessSettingsForm>({
    resolver: zodResolver(businessSettingsSchema),
    defaultValues: {
      name: business?.name ?? '',
      currency: business?.currency ?? 'RWF',
      country: business?.country ?? 'Rwanda',
      timezone: business?.timezone ?? 'Africa/Kigali',
    },
  });

  const onSubmit = async (data: BusinessSettingsForm) => {
    if (!business) return;
    try {
      const updated = await businessRepository.update(business.id, data);
      if (updated) useAuthStore.getState().setBusiness(updated);
      showToast(t('settings.businessUpdated'), 'success');
    } catch (error) {
      console.error('Failed to update business:', error);
      showToast(t('settings.businessFailed'), 'error');
    }
  };

  return (
    <FormScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('settings.businessSettings')}</Text>
        <Text style={styles.subtitle}>{t('settings.businessSettingsDesc')}</Text>
      </View>

      <View style={styles.form}>
        <FormInput control={control} name="name"
            label={t('auth.businessName')}
            required
          />
        
        <FormPicker control={control} name="currency" label={t('auth.currency')}>{CURRENCIES.map((c) => <Picker.Item key={c.value} label={c.label} value={c.value} />)}</FormPicker>
        
        <FormPicker control={control} name="country" label={t('auth.country')}>{COUNTRIES.map((c) => <Picker.Item key={c.value} label={c.label} value={c.value} />)}</FormPicker>
        
        <FormPicker control={control} name="timezone" label={t('auth.timezone')}>{TIMEZONES.map((tz) => <Picker.Item key={tz.value} label={tz.label} value={tz.value} />)}</FormPicker>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>{t('settings.businessCode')}</Text>
        <View style={styles.codeContainer}>
          <Text style={styles.codeText}>{business?.business_code}</Text>
          <TouchableOpacity style={styles.copyButton} onPress={() => {}}>
            <Ionicons name="copy" size={20} color="#0ea5e9" />
          </TouchableOpacity>
        </View>
        <Text style={styles.infoDesc}>{t('settings.businessCodeDesc')}</Text>
      </View>

      <Button variant="primary" fullWidth loading={isSubmitting} onPress={() => handleSubmit(onSubmit)()}>
        {t('common.save')}
      </Button>
    </FormScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  form: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  fieldGroup: {
    position: 'relative',
  },
  picker: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
  infoSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  codeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  copyButton: {
    padding: 4,
  },
  infoDesc: {
    fontSize: 12,
    color: '#6b7280',
  },
});

import { Picker } from '@react-native-picker/picker';

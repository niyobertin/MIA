import { FormScrollView, Logo, FormInput, FormPicker, Button } from '@/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';

const createBusinessSchema = z.object({
  name: z.string().min(2, 'Business name must be at least 2 characters'),
  currency: z.string(),
  country: z.string(),
  timezone: z.string(),
});

type CreateBusinessForm = z.infer<typeof createBusinessSchema>;

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

export default function CreateBusinessScreen() {
  const { t } = useTranslation();
  const { createBusiness, user } = useAuthStore();
  const { control, handleSubmit, formState: { isSubmitting } } = useForm<CreateBusinessForm>({
    resolver: zodResolver(createBusinessSchema),
    defaultValues: {
      name: '',
      currency: 'RWF',
      country: 'Rwanda',
      timezone: 'Africa/Kigali',
    },
  });

  const onSubmit = async (data: CreateBusinessForm) => {
    try {
      await createBusiness(data);
    } catch {
      // Toast handled in store
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <FormScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Link href="/(onboarding)" asChild>
            <TouchableOpacity style={styles.backButton}>
              <Ionicons name="chevron-back" size={28} color="#374151" />
            </TouchableOpacity>
          </Link>
        </View>

        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Logo size={136} />
          </View>

          <Text style={styles.title}>{t('auth.createBusiness')}</Text>
          <Text style={styles.subtitle}>
            {t('auth.businessSetupDescription')}
            {user?.name ? `\n${t('auth.youWillBeOwner')}` : ''}
          </Text>

          <View style={styles.form}>
            <FormInput
              control={control}
              name="name"
              label={t('auth.businessName')}
              placeholder={t('auth.businessName')}
              autoCapitalize="words"
              required
            />

            <FormPicker control={control} name="currency" label={t('auth.currency')}>
              {CURRENCIES.map((c) => (
                <Picker.Item key={c.value} label={c.label} value={c.value} />
              ))}
            </FormPicker>

            <FormPicker control={control} name="country" label={t('auth.country')}>
              {COUNTRIES.map((c) => (
                <Picker.Item key={c.value} label={c.label} value={c.value} />
              ))}
            </FormPicker>

            <FormPicker control={control} name="timezone" label={t('auth.timezone')}>
              {TIMEZONES.map((tz) => (
                <Picker.Item key={tz.value} label={tz.label} value={tz.value} />
              ))}
            </FormPicker>
          </View>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={isSubmitting}
            onPress={() => handleSubmit(onSubmit)()}
          >
            {t('auth.createBusiness')}
          </Button>
        </View>
      </FormScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backButton: {
    padding: 8,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 24,
    justifyContent: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  form: {
    gap: 16,
    marginBottom: 8,
  },
});

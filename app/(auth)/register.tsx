import { FormScrollView, FormInput, Button, Logo } from '@/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterScreen() {
  const { t } = useTranslation();
  const { register: registerUser } = useAuthStore();
  const { control, handleSubmit, formState: { isSubmitting } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', phone: '', password: '', confirmPassword: '' },
  });

  const onSubmit = async (data: RegisterForm) => {
    await registerUser({
      name: data.name,
      email: data.email,
      phone: data.phone,
      password: data.password,
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <FormScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Link href="/(auth)" asChild>
            <TouchableOpacity style={styles.backButton}>
              <Ionicons name="chevron-back" size={28} color="#374151" />
            </TouchableOpacity>
          </Link>
        </View>

        <View style={styles.content}>
          <Logo size={88} style={styles.logo} />
          <Text style={styles.title}>{t('auth.createAccount')}</Text>
          <Text style={styles.subtitle}>{t('auth.registerDescription')}</Text>

          <View style={styles.form}>
            <FormInput
              control={control}
              name="name"
              label={t('auth.name')}
              placeholder={t('auth.name')}
              autoCapitalize="words"
              autoComplete="name"
              required
            />
            <FormInput
              control={control}
              name="email"
              label={t('auth.email')}
              placeholder={t('auth.email')}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              required
            />
            <FormInput
              control={control}
              name="phone"
              label={t('auth.phone')}
              placeholder={t('auth.phone')}
              keyboardType="phone-pad"
              autoComplete="tel"
            />
            <FormInput
              control={control}
              name="password"
              label={t('auth.password')}
              placeholder={t('auth.password')}
              secureTextEntry
              autoComplete="new-password"
              required
            />
            <FormInput
              control={control}
              name="confirmPassword"
              label={t('auth.confirmPassword')}
              placeholder={t('auth.confirmPassword')}
              secureTextEntry
              autoComplete="new-password"
              required
            />
          </View>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={isSubmitting}
            onPress={() => handleSubmit(onSubmit)()}
          >
            {t('auth.createAccount')}
          </Button>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('auth.hasAccount')}</Text>
            <View style={styles.dividerLine} />
          </View>

          <Link href="/(auth)/login" asChild>
            <Button variant="outline" size="lg" fullWidth>
              {t('auth.signIn')}
            </Button>
          </Link>
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
    paddingBottom: 48,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
  },
  logo: {
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 32,
  },
  form: {
    gap: 16,
    marginBottom: 8,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  dividerText: {
    fontSize: 14,
    color: '#9ca3af',
  },
});

import { FormScrollView, FormInput, FormPinInput, Button, Logo } from '@/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import { useAuthStore } from '@/stores/authStore';
import { getPinProblem } from '@/utils/pin';

function buildRegisterSchema(t: TFunction) {
  return z.object({
    name: z.string().trim().min(2, t('auth.nameRequired')),
    email: z.string().trim().email(t('auth.invalidEmail')),
    phone: z.string().optional(),
    password: z.string().superRefine((value, ctx) => {
      const problem = getPinProblem(value);
      if (problem) ctx.addIssue({ code: 'custom', message: t(`auth.${problem}`) });
    }),
    confirmPassword: z.string(),
  }).refine((data) => data.password === data.confirmPassword, {
    message: t('auth.pinMismatch'),
    path: ['confirmPassword'],
  });
}

type RegisterForm = z.infer<ReturnType<typeof buildRegisterSchema>>;

export default function RegisterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const registerUser = useAuthStore((s) => s.register);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.setError);
  const registerSchema = React.useMemo(() => buildRegisterSchema(t), [t]);
  const { control, handleSubmit, formState: { isSubmitting } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', phone: '', password: '', confirmPassword: '' },
  });

  React.useEffect(() => {
    clearError(null);
  }, [clearError]);

  const onSubmit = async (data: RegisterForm) => {
    await registerUser({
      name: data.name,
      email: data.email,
      phone: data.phone,
      password: data.password,
    });
    const { user, isAuthenticated } = useAuthStore.getState();
    if (isAuthenticated && user && !user.business_id) {
      router.replace('/(onboarding)');
    }
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

          {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

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
            <FormPinInput
              control={control}
              name="password"
              label={t('auth.createPin')}
              helperText={t('auth.pinHelper')}
              testID="register-pin"
            />
            <FormPinInput
              control={control}
              name="confirmPassword"
              label={t('auth.confirmPin')}
              allowReveal={false}
              testID="register-pin-confirm"
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
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
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
    marginBottom: 24,
  },
  errorBanner: {
    backgroundColor: '#fef2f2',
    color: '#b91c1c',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    fontSize: 14,
    fontWeight: '600',
    overflow: 'hidden',
  },
  form: {
    gap: 4,
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

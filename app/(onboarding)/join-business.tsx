import { FormScrollView, Logo, FormInput, Button } from '@/components';
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

const joinBusinessSchema = z.object({
  businessCode: z.string().min(6, 'Enter a valid business code'),
});

type JoinBusinessForm = z.infer<typeof joinBusinessSchema>;

export default function JoinBusinessScreen() {
  const { t } = useTranslation();
  const { joinBusiness } = useAuthStore();
  const { control, handleSubmit, formState: { isSubmitting } } = useForm<JoinBusinessForm>({
    resolver: zodResolver(joinBusinessSchema),
    defaultValues: { businessCode: '' },
  });

  const onSubmit = async (data: JoinBusinessForm) => {
    try {
      await joinBusiness(data.businessCode);
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
          <Logo size={112} style={styles.logo} />
          <Text style={styles.title}>{t('auth.joinBusiness')}</Text>
          <Text style={styles.subtitle}>{t('auth.joinBusinessDescription')}</Text>

          <View style={styles.form}>
            <FormInput
              control={control}
              name="businessCode"
              label={t('auth.businessCode')}
              placeholder="MIA-RW-XXXX"
              autoCapitalize="characters"
              autoCorrect={false}
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
            {t('auth.joinBusiness')}
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
  logo: {
    alignSelf: 'center',
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

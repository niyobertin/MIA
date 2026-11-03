import { FormScrollView, Input, Button, Logo, PinInput } from '@/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { colors, radius } from '@/theme/tokens';
import { getInitials } from '@/utils/formatters';
import { isPinFormat } from '@/utils/pin';
import {
  forgetRememberedAccount,
  getRememberedAccount,
  RememberedAccount,
} from '@/services/auth/pinAuth';
import type { PinInputHandle } from '@/components/PinInput';

const emailSchema = z.string().trim().email();

export default function LoginScreen() {
  const { t } = useTranslation();
  const login = useAuthStore((s) => s.login);
  const error = useAuthStore((s) => s.error);
  const setError = useAuthStore((s) => s.setError);

  const [remembered, setRemembered] = React.useState<RememberedAccount | null>(null);
  const [email, setEmail] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [usePassword, setUsePassword] = React.useState(false);
  const [emailError, setEmailError] = React.useState<string | undefined>();
  const [secretError, setSecretError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);
  const pinRef = React.useRef<PinInputHandle>(null);

  React.useEffect(() => {
    setError(null);
    void getRememberedAccount().then((account) => {
      if (account) {
        setRemembered(account);
        setEmail(account.email);
      }
    });
  }, [setError]);

  const submit = async (pinOverride?: string) => {
    if (submitting) return;
    const secret = usePassword ? password : pinOverride ?? pin;
    const emailValid = emailSchema.safeParse(email).success;
    setEmailError(emailValid ? undefined : t('auth.invalidEmail'));
    if (usePassword) {
      setSecretError(secret.length >= 4 ? undefined : t('auth.passwordRequired'));
      if (!emailValid || secret.length < 4) return;
    } else {
      setSecretError(isPinFormat(secret) ? undefined : t('auth.pinRequired'));
      if (!emailValid || !isPinFormat(secret)) return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), secret);
      if (!useAuthStore.getState().isAuthenticated) {
        setPin('');
        setPassword('');
        pinRef.current?.focus();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const switchAccount = () => {
    void forgetRememberedAccount();
    setRemembered(null);
    setEmail('');
    setPin('');
    setError(null);
  };

  const toggleMode = () => {
    setUsePassword((prev) => !prev);
    setPin('');
    setPassword('');
    setSecretError(undefined);
    setError(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <FormScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Link href="/(auth)" asChild>
            <TouchableOpacity style={styles.backButton} accessibilityRole="button" accessibilityLabel={t('common.back')}>
              <Ionicons name="chevron-back" size={28} color={colors.body} />
            </TouchableOpacity>
          </Link>
        </View>

        <View style={styles.content}>
          <Logo size={72} style={styles.logo} />

          {remembered ? (
            <View style={styles.accountCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getInitials(remembered.name || remembered.email)}</Text>
              </View>
              <Text style={styles.welcomeBack}>{t('auth.welcomeBack')}</Text>
              <Text style={styles.accountName} numberOfLines={1}>{remembered.name}</Text>
              <Text style={styles.accountEmail} numberOfLines={1}>{remembered.email}</Text>
              <TouchableOpacity onPress={switchAccount} hitSlop={8} accessibilityRole="button">
                <Text style={styles.link}>{t('auth.notYou')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.title}>{t('auth.signIn')}</Text>
              <Text style={styles.subtitle}>{t('auth.onlineLoginHint')}</Text>
              <Input
                label={t('auth.email')}
                placeholder="name@example.com"
                placeholderTextColor={colors.faint}
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setEmailError(undefined);
                  if (error) setError(null);
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => pinRef.current?.focus()}
                error={emailError}
                required
              />
            </>
          )}

          {usePassword ? (
            <Input
              label={t('auth.password')}
              placeholder={t('auth.password')}
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setSecretError(undefined);
                if (error) setError(null);
              }}
              secureTextEntry
              autoComplete="password"
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
              error={secretError}
              required
            />
          ) : (
            <PinInput
              ref={pinRef}
              label={remembered ? t('auth.enterPin') : t('auth.pinLabel')}
              value={pin}
              onChangeText={(value) => {
                setPin(value);
                setSecretError(undefined);
                if (error) setError(null);
              }}
              onComplete={(value) => void submit(value)}
              autoFocus={!!remembered}
              disabled={submitting}
              error={secretError}
              invalid={!!error}
              testID="login-pin"
            />
          )}

          {error ? (
            <View style={styles.errorBanner} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle" size={18} color={colors.dangerText} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={submitting}
            onPress={() => void submit()}
          >
            {t('auth.signIn')}
          </Button>

          <Text style={styles.helpText}>{t('auth.forgotPin')}</Text>

          <View style={styles.legacyRow}>
            {!usePassword ? <Text style={styles.legacyText}>{t('auth.legacyAccountPrompt')}</Text> : null}
            <TouchableOpacity onPress={toggleMode} hitSlop={8} accessibilityRole="button">
              <Text style={styles.link}>{usePassword ? t('auth.usePin') : t('auth.usePassword')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('auth.noAccount')}</Text>
            <View style={styles.dividerLine} />
          </View>

          <Link href="/(auth)/register" asChild>
            <Button variant="outline" size="lg" fullWidth>
              {t('auth.createAccount')}
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
    backgroundColor: colors.card,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backButton: {
    padding: 8,
    alignSelf: 'flex-start',
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
    paddingBottom: 32,
  },
  logo: {
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.muted,
    marginBottom: 24,
  },
  accountCard: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginBottom: 24,
    gap: 2,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarText: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '700',
  },
  welcomeBack: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '500',
  },
  accountName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
  },
  accountEmail: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 10,
  },
  link: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    color: colors.dangerText,
    fontSize: 14,
    fontWeight: '600',
  },
  helpText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 16,
  },
  legacyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  legacyText: {
    fontSize: 13,
    color: colors.muted,
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
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 14,
    color: colors.faint,
  },
});

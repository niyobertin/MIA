import { FormScrollView, Input, Button, Logo, PinInput } from '@/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { colors, radius } from '@/theme/tokens';
import { showToast } from '@/stores/toastStore';
import { getPinProblem } from '@/utils/pin';
import { cloudRequestPinReset, cloudResetPin } from '@/services/auth/cloudAuth';
import {
  clearLocalFailures,
  describePinResetError,
  getRememberedAccount,
} from '@/services/auth/pinAuth';

const emailSchema = z.string().trim().email();
const codeSchema = z.string().regex(/^\d{6}$/);

export default function ForgotPinScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [step, setStep] = React.useState<'email' | 'reset'>('email');
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [confirmPin, setConfirmPin] = React.useState('');
  const [emailError, setEmailError] = React.useState<string | undefined>();
  const [codeError, setCodeError] = React.useState<string | undefined>();
  const [pinError, setPinError] = React.useState<string | undefined>();
  const [confirmError, setConfirmError] = React.useState<string | undefined>();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    void getRememberedAccount().then((account) => {
      if (account) setEmail(account.email);
    });
  }, []);

  const goBack = () => {
    if (step === 'reset') {
      setStep('email');
      setError(null);
      setNotice(null);
      return;
    }
    router.replace('/(auth)/login');
  };

  const sendCode = async () => {
    if (submitting) return;
    if (!emailSchema.safeParse(email).success) {
      setEmailError(t('auth.invalidEmail'));
      return;
    }
    setEmailError(undefined);
    setError(null);
    setSubmitting(true);
    try {
      await cloudRequestPinReset(email);
      setStep('reset');
    } catch (problem) {
      setError(describePinResetError(problem));
    } finally {
      setSubmitting(false);
    }
  };

  const resendCode = async () => {
    setError(null);
    setNotice(null);
    try {
      await cloudRequestPinReset(email);
      setNotice(t('auth.resendCodeSent'));
    } catch (problem) {
      setError(describePinResetError(problem));
    }
  };

  const submitReset = async () => {
    if (submitting) return;
    const pinProblem = getPinProblem(pin);
    const nextCodeError = codeSchema.safeParse(code).success ? undefined : t('auth.resetCodeRequired');
    const nextPinError = pinProblem ? t(`auth.${pinProblem}`) : undefined;
    const nextConfirmError = confirmPin === pin ? undefined : t('auth.pinMismatch');
    setCodeError(nextCodeError);
    setPinError(nextPinError);
    setConfirmError(nextConfirmError);
    if (nextCodeError || nextPinError || nextConfirmError) return;

    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await cloudResetPin(email, code, pin);
      await clearLocalFailures(email.trim().toLowerCase());
      showToast(t('auth.pinResetDone'), 'success');
      router.replace('/(auth)/login');
    } catch (problem) {
      setError(describePinResetError(problem));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <FormScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <Ionicons name="chevron-back" size={28} color={colors.body} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Logo size={72} style={styles.logo} />
          <Text style={styles.title}>{step === 'email' ? t('auth.resetPinTitle') : t('auth.choosePinTitle')}</Text>
          <Text style={styles.subtitle}>{step === 'email' ? t('auth.resetPinSubtitle') : t('auth.resetCodeSent')}</Text>

          {step === 'email' ? (
            <Input
              label={t('auth.email')}
              placeholder="name@example.com"
              placeholderTextColor={colors.faint}
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setEmailError(undefined);
                setError(null);
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={() => void sendCode()}
              error={emailError}
              required
            />
          ) : (
            <>
              <Input
                label={t('auth.resetCodeLabel')}
                value={code}
                onChangeText={(value) => {
                  setCode(value.replace(/\D/g, '').slice(0, 6));
                  setCodeError(undefined);
                  setError(null);
                }}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                error={codeError}
                required
                testID="reset-code"
              />
              <PinInput
                label={t('auth.newPinLabel')}
                value={pin}
                onChangeText={(value) => {
                  setPin(value);
                  setPinError(undefined);
                  setError(null);
                }}
                helperText={t('auth.pinHelper')}
                disabled={submitting}
                error={pinError}
                testID="reset-pin"
              />
              <PinInput
                label={t('auth.confirmPin')}
                value={confirmPin}
                onChangeText={(value) => {
                  setConfirmPin(value);
                  setConfirmError(undefined);
                  setError(null);
                }}
                disabled={submitting}
                error={confirmError}
                testID="reset-pin-confirm"
              />
            </>
          )}

          {error ? (
            <View style={styles.errorBanner} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle" size={18} color={colors.dangerText} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {notice ? (
            <Text style={styles.noticeText} accessibilityLiveRegion="polite">{notice}</Text>
          ) : null}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={submitting}
            onPress={() => void (step === 'email' ? sendCode() : submitReset())}
          >
            {step === 'email' ? t('auth.sendResetCode') : t('auth.resetPinSubmit')}
          </Button>

          {step === 'reset' ? (
            <TouchableOpacity onPress={() => void resendCode()} hitSlop={8} accessibilityRole="button" style={styles.linkRow}>
              <Text style={styles.link}>{t('auth.resendCode')}</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity onPress={() => router.replace('/(auth)/login')} hitSlop={8} accessibilityRole="button" style={styles.linkRow}>
            <Text style={styles.link}>{t('auth.backToSignIn')}</Text>
          </TouchableOpacity>

          <Text style={styles.helpText}>{t('auth.forgotPin')}</Text>
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
  noticeText: {
    color: colors.successText,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  linkRow: {
    alignSelf: 'center',
    marginTop: 16,
  },
  link: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
  helpText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 20,
  },
});

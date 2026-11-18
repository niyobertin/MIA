import { FormScrollView, Input, Button, Logo, PinInput } from '@/components';
import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, radius } from '@/theme/tokens';
import { showToast } from '@/stores/toastStore';
import { getPinProblem } from '@/utils/pin';
import { normalizePhone, parseIdentifier } from '@/utils/identity';
import { cloudRequestPinHelp, cloudRequestPinReset, cloudResetPin } from '@/services/auth/cloudAuth';
import {
  clearLocalFailures,
  describePinResetError,
  getRememberedAccount,
} from '@/services/auth/pinAuth';

type Step = 'identify' | 'reset' | 'help' | 'helpSent';

const CODE_PATTERN = /^\d{6}$/;

export default function ForgotPinScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [step, setStep] = React.useState<Step>('identify');
  const [identifier, setIdentifier] = React.useState('');
  const [code, setCode] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [confirmPin, setConfirmPin] = React.useState('');
  const [helpName, setHelpName] = React.useState('');
  const [helpPhone, setHelpPhone] = React.useState('');
  const [helpMessage, setHelpMessage] = React.useState('');
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string | undefined>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    void getRememberedAccount().then((account) => {
      if (account) {
        setIdentifier(account.identifier);
        setHelpName(account.name);
      }
    });
  }, []);

  const clearMessages = () => {
    setError(null);
    setNotice(null);
  };

  const setFieldError = (key: string, value?: string) =>
    setFieldErrors((prev) => ({ ...prev, [key]: value }));

  const goTo = (next: Step) => {
    clearMessages();
    setFieldErrors({});
    setStep(next);
  };

  const goBack = () => {
    if (step === 'reset' || step === 'help') {
      goTo('identify');
      return;
    }
    router.replace('/(auth)/login');
  };

  const requireIdentifier = (): boolean => {
    const valid = parseIdentifier(identifier) !== null;
    setFieldError('identifier', valid ? undefined : t('auth.invalidIdentifier'));
    return valid;
  };

  const sendCode = async () => {
    if (submitting || !requireIdentifier()) return;
    clearMessages();
    setSubmitting(true);
    try {
      await cloudRequestPinReset(identifier);
      setStep('reset');
    } catch (problem) {
      setError(describePinResetError(problem));
    } finally {
      setSubmitting(false);
    }
  };

  const resendCode = async () => {
    clearMessages();
    try {
      await cloudRequestPinReset(identifier);
      setNotice(t('auth.resendCodeSent'));
    } catch (problem) {
      setError(describePinResetError(problem));
    }
  };

  const openHelp = () => {
    const parsed = parseIdentifier(identifier);
    if (parsed?.kind === 'phone' && !helpPhone) setHelpPhone(identifier);
    goTo('help');
  };

  const submitReset = async () => {
    if (submitting) return;
    const pinProblem = getPinProblem(pin);
    const errors = {
      code: CODE_PATTERN.test(code) ? undefined : t('auth.resetCodeRequired'),
      pin: pinProblem ? t(`auth.${pinProblem}`) : undefined,
      confirm: confirmPin === pin ? undefined : t('auth.pinMismatch'),
    };
    setFieldErrors(errors);
    if (errors.code || errors.pin || errors.confirm) return;

    clearMessages();
    setSubmitting(true);
    try {
      await cloudResetPin(identifier, code, pin);
      await clearLocalFailures(parseIdentifier(identifier)?.value ?? identifier);
      showToast(t('auth.pinResetDone'), 'success');
      router.replace('/(auth)/login');
    } catch (problem) {
      setError(describePinResetError(problem));
    } finally {
      setSubmitting(false);
    }
  };

  const submitHelp = async () => {
    if (submitting) return;
    const identifierValid = requireIdentifier();
    const errors = {
      identifier: identifierValid ? undefined : t('auth.invalidIdentifier'),
      helpName: helpName.trim().length >= 2 ? undefined : t('auth.nameRequired'),
      helpPhone: normalizePhone(helpPhone) ? undefined : t('auth.helpPhoneRequired'),
    };
    setFieldErrors(errors);
    if (errors.identifier || errors.helpName || errors.helpPhone) return;

    clearMessages();
    setSubmitting(true);
    try {
      await cloudRequestPinHelp({
        identifier,
        name: helpName,
        contactPhone: helpPhone,
        message: helpMessage,
      });
      setStep('helpSent');
    } catch (problem) {
      setError(describePinResetError(problem));
    } finally {
      setSubmitting(false);
    }
  };

  const titles: Record<Step, string> = {
    identify: t('auth.resetPinTitle'),
    reset: t('auth.choosePinTitle'),
    help: t('auth.pinHelpTitle'),
    helpSent: t('auth.pinHelpSentTitle'),
  };
  const subtitles: Record<Step, string> = {
    identify: t('auth.resetPinSubtitle'),
    reset: t('auth.resetCodeSent'),
    help: t('auth.pinHelpSubtitle'),
    helpSent: t('auth.pinHelpSentBody'),
  };

  const identifierInput = (
    <Input
      label={t('auth.emailOrPhone')}
      placeholder={t('auth.emailOrPhonePlaceholder')}
      placeholderTextColor={colors.faint}
      value={identifier}
      onChangeText={(value) => {
        setIdentifier(value);
        setFieldError('identifier');
        setError(null);
      }}
      keyboardType="email-address"
      autoCapitalize="none"
      autoComplete="username"
      autoCorrect={false}
      returnKeyType="go"
      onSubmitEditing={() => void (step === 'help' ? submitHelp() : sendCode())}
      error={fieldErrors.identifier}
      required
      testID="reset-identifier"
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      <FormScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <Ionicons name="chevron-back" size={28} color={colors.body} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {step === 'helpSent' ? (
            <View style={styles.sentIcon}>
              <Ionicons name="call" size={36} color={colors.primary} />
            </View>
          ) : (
            <Logo size={72} style={styles.logo} />
          )}
          <Text style={styles.title}>{titles[step]}</Text>
          <Text style={styles.subtitle}>{subtitles[step]}</Text>

          {step === 'identify' ? identifierInput : null}

          {step === 'reset' ? (
            <>
              <Input
                label={t('auth.resetCodeLabel')}
                value={code}
                onChangeText={(value) => {
                  setCode(value.replace(/\D/g, '').slice(0, 6));
                  setFieldError('code');
                  setError(null);
                }}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                error={fieldErrors.code}
                required
                testID="reset-code"
              />
              <PinInput
                label={t('auth.newPinLabel')}
                value={pin}
                onChangeText={(value) => {
                  setPin(value);
                  setFieldError('pin');
                  setError(null);
                }}
                helperText={t('auth.pinHelper')}
                disabled={submitting}
                error={fieldErrors.pin}
                testID="reset-pin"
              />
              <PinInput
                label={t('auth.confirmPin')}
                value={confirmPin}
                onChangeText={(value) => {
                  setConfirmPin(value);
                  setFieldError('confirm');
                  setError(null);
                }}
                disabled={submitting}
                error={fieldErrors.confirm}
                testID="reset-pin-confirm"
              />
            </>
          ) : null}

          {step === 'help' ? (
            <>
              {identifierInput}
              <Input
                label={t('auth.name')}
                value={helpName}
                onChangeText={(value) => {
                  setHelpName(value);
                  setFieldError('helpName');
                }}
                autoCapitalize="words"
                error={fieldErrors.helpName}
                required
                testID="help-name"
              />
              <Input
                label={t('auth.helpPhoneLabel')}
                placeholder="0788 123 456"
                placeholderTextColor={colors.faint}
                value={helpPhone}
                onChangeText={(value) => {
                  setHelpPhone(value);
                  setFieldError('helpPhone');
                }}
                keyboardType="phone-pad"
                helperText={t('auth.helpPhoneHelper')}
                error={fieldErrors.helpPhone}
                required
                testID="help-phone"
              />
              <Input
                label={t('auth.helpMessageLabel')}
                value={helpMessage}
                onChangeText={setHelpMessage}
                multiline
                maxLength={500}
                testID="help-message"
              />
            </>
          ) : null}

          {error ? (
            <View style={styles.errorBanner} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle" size={18} color={colors.dangerText} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {notice ? (
            <Text style={styles.noticeText} accessibilityLiveRegion="polite">{notice}</Text>
          ) : null}

          {step === 'identify' ? (
            <Button variant="primary" size="lg" fullWidth loading={submitting} onPress={() => void sendCode()}>
              {t('auth.sendResetCode')}
            </Button>
          ) : null}
          {step === 'reset' ? (
            <Button variant="primary" size="lg" fullWidth loading={submitting} onPress={() => void submitReset()}>
              {t('auth.resetPinSubmit')}
            </Button>
          ) : null}
          {step === 'help' ? (
            <Button variant="primary" size="lg" fullWidth loading={submitting} onPress={() => void submitHelp()}>
              {t('auth.pinHelpSubmit')}
            </Button>
          ) : null}
          {step === 'helpSent' ? (
            <Button variant="primary" size="lg" fullWidth onPress={() => router.replace('/(auth)/login')}>
              {t('auth.backToSignIn')}
            </Button>
          ) : null}

          {step === 'reset' ? (
            <TouchableOpacity onPress={() => void resendCode()} hitSlop={8} accessibilityRole="button" style={styles.linkRow}>
              <Text style={styles.link}>{t('auth.resendCode')}</Text>
            </TouchableOpacity>
          ) : null}

          {step === 'identify' || step === 'reset' ? (
            <View style={styles.helpCard}>
              <Text style={styles.helpCardTitle}>{t('auth.noEmailTitle')}</Text>
              <Text style={styles.helpCardText}>{t('auth.noEmailBody')}</Text>
              <TouchableOpacity onPress={openHelp} hitSlop={8} accessibilityRole="button">
                <Text style={styles.link}>{t('auth.askSupport')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {step !== 'helpSent' ? (
            <TouchableOpacity onPress={() => router.replace('/(auth)/login')} hitSlop={8} accessibilityRole="button" style={styles.linkRow}>
              <Text style={styles.link}>{t('auth.backToSignIn')}</Text>
            </TouchableOpacity>
          ) : null}
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
  helpCard: {
    marginTop: 24,
    padding: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    gap: 6,
  },
  helpCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  helpCardText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    marginBottom: 4,
  },
  sentIcon: {
    alignSelf: 'center',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
});

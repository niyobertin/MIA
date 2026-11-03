import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { getPinProblem } from '@/utils/pin';
import { Button } from './Button';
import { Input } from './Input';
import { PinInput } from './PinInput';

export function ChangePinForm({
  askCurrent,
  currentIsPassword = false,
  onDone,
}: {
  askCurrent: boolean;
  currentIsPassword?: boolean;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const changePin = useAuthStore((s) => s.changePin);
  const [current, setCurrent] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [errors, setErrors] = React.useState<{ current?: string; pin?: string; confirm?: string }>({});
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    const next: typeof errors = {};
    if (askCurrent && current.length < 4) {
      next.current = currentIsPassword ? t('auth.passwordRequired') : t('auth.pinRequired');
    }
    const problem = getPinProblem(pin);
    if (problem) next.pin = t(`auth.${problem}`);
    else if (pin !== confirm) next.confirm = t('auth.pinMismatch');
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      const ok = await changePin(askCurrent ? current : null, pin);
      if (ok) {
        setCurrent('');
        setPin('');
        setConfirm('');
        onDone?.();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      {askCurrent ? (
        currentIsPassword ? (
          <Input
            label={t('auth.currentPassword')}
            value={current}
            onChangeText={(value) => {
              setCurrent(value);
              setErrors((e) => ({ ...e, current: undefined }));
            }}
            secureTextEntry
            autoComplete="password"
            error={errors.current}
          />
        ) : (
          <PinInput
            label={t('auth.currentPin')}
            value={current}
            onChangeText={(value) => {
              setCurrent(value);
              setErrors((e) => ({ ...e, current: undefined }));
            }}
            error={errors.current}
            allowReveal={false}
          />
        )
      ) : null}
      <PinInput
        label={t('auth.newPin')}
        value={pin}
        onChangeText={(value) => {
          setPin(value);
          setErrors((e) => ({ ...e, pin: undefined }));
        }}
        error={errors.pin}
        helperText={t('auth.pinHelper')}
        autoFocus={!askCurrent}
      />
      <PinInput
        label={t('auth.confirmPin')}
        value={confirm}
        onChangeText={(value) => {
          setConfirm(value);
          setErrors((e) => ({ ...e, confirm: undefined }));
        }}
        error={errors.confirm}
        allowReveal={false}
      />
      <Button variant="primary" size="lg" fullWidth loading={saving} onPress={() => void submit()}>
        {t('auth.savePin')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 8,
  },
});

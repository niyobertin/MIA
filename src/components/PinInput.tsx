import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Control, FieldPath, FieldValues, useController } from 'react-hook-form';
import { colors, radius } from '@/theme/tokens';
import { PIN_LENGTH, sanitizePinInput } from '@/utils/pin';
import { FormScrollContext } from './FormScrollView';

export interface PinInputProps {
  value: string;
  onChangeText: (value: string) => void;
  onComplete?: (value: string) => void;
  label?: string;
  error?: string;
  invalid?: boolean;
  helperText?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  allowReveal?: boolean;
  testID?: string;
}

export type PinInputHandle = {
  focus: () => void;
  clear: () => void;
};

export const PinInput = React.forwardRef<PinInputHandle, PinInputProps>(({
  value,
  onChangeText,
  onComplete,
  label,
  error,
  invalid = false,
  helperText,
  autoFocus = false,
  disabled = false,
  allowReveal = true,
  testID,
}, ref) => {
  const { t } = useTranslation();
  const inputRef = React.useRef<TextInput>(null);
  const focusInput = React.useContext(FormScrollContext);
  const [focused, setFocused] = React.useState(false);
  const [revealed, setRevealed] = React.useState(false);

  React.useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear: () => onChangeText(''),
  }), [onChangeText]);

  const handleChange = (raw: string) => {
    const next = sanitizePinInput(raw);
    onChangeText(next);
    if (next.length === PIN_LENGTH && value.length !== PIN_LENGTH) {
      onComplete?.(next);
    }
  };

  const activeIndex = Math.min(value.length, PIN_LENGTH - 1);

  return (
    <View style={styles.container}>
      {label || allowReveal ? (
        <View style={styles.labelRow}>
          {label ? <Text style={styles.label}>{label}</Text> : <View />}
          {allowReveal ? (
            <TouchableOpacity
              onPress={() => setRevealed((prev) => !prev)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={revealed ? t('auth.hidePin') : t('auth.showPin')}
              style={styles.revealButton}
            >
              <Ionicons
                name={revealed ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color={colors.muted}
              />
              <Text style={styles.revealText}>{revealed ? t('auth.hidePin') : t('auth.showPin')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <Pressable
        onPress={() => inputRef.current?.focus()}
        disabled={disabled}
        accessibilityRole="none"
        style={styles.boxes}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, index) => {
          const digit = value[index];
          const isActive = focused && index === activeIndex && !disabled;
          return (
            <View
              key={index}
              style={[
                styles.box,
                digit ? styles.boxFilled : null,
                isActive ? styles.boxActive : null,
                error || invalid ? styles.boxError : null,
                disabled ? styles.boxDisabled : null,
              ]}
            >
              {digit ? (
                revealed ? (
                  <Text style={styles.digit}>{digit}</Text>
                ) : (
                  <View style={[styles.dot, error || invalid ? styles.dotError : null]} />
                )
              ) : isActive ? (
                <View style={styles.caret} />
              ) : null}
            </View>
          );
        })}
        <TextInput
          ref={inputRef}
          testID={testID}
          value={value}
          onChangeText={handleChange}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={PIN_LENGTH}
          autoFocus={autoFocus}
          editable={!disabled}
          caretHidden
          contextMenuHidden
          autoComplete="off"
          autoCorrect={false}
          importantForAutofill="no"
          accessibilityLabel={label ?? t('auth.pin')}
          style={styles.hiddenInput}
          onFocus={() => {
            setFocused(true);
            focusInput?.(inputRef.current);
          }}
          onBlur={() => {
            setFocused(false);
            focusInput?.(null);
          }}
        />
      </Pressable>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {helperText && !error ? <Text style={styles.helperText}>{helperText}</Text> : null}
    </View>
  );
});

PinInput.displayName = 'PinInput';

interface FormPinInputProps<T extends FieldValues, N extends FieldPath<T>>
  extends Omit<PinInputProps, 'value' | 'onChangeText'> {
  control: Control<T>;
  name: N;
}

export function FormPinInput<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  error,
  ...props
}: FormPinInputProps<T, N>) {
  const { field, fieldState } = useController({ control, name });

  return (
    <PinInput
      {...props}
      value={String(field.value ?? '')}
      onChangeText={field.onChange}
      error={error ?? fieldState.error?.message}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.body,
  },
  revealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  revealText: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '500',
  },
  boxes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  box: {
    flex: 1,
    maxWidth: 72,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: {
    backgroundColor: colors.card,
    borderColor: colors.primary,
  },
  boxActive: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primarySoft,
  },
  boxError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  boxDisabled: {
    opacity: 0.5,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.ink,
  },
  dotError: {
    backgroundColor: colors.danger,
  },
  digit: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.ink,
  },
  caret: {
    width: 2,
    height: 24,
    borderRadius: 1,
    backgroundColor: colors.primary,
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    color: 'transparent',
  },
  errorText: {
    fontSize: 13,
    color: colors.dangerText,
    marginTop: 8,
    fontWeight: '500',
  },
  helperText: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 8,
  },
});

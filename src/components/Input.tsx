import React from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { FormScrollContext } from './FormScrollView';

export interface InputProps extends Omit<React.ComponentProps<typeof TextInput>, 'onChangeText' | 'value' | 'disabled'> {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  disabled?: boolean;
  required?: boolean;
  /** When true (default for secure fields), shows an eye icon to reveal/hide the password. */
  showPasswordToggle?: boolean;
}

export const Input = React.forwardRef<TextInput, InputProps>(({
  label,
  value,
  onChangeText,
  error,
  helperText,
  leftIcon,
  rightIcon,
  style,
  placeholder,
  secureTextEntry = false,
  showPasswordToggle,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  disabled = false,
  required = false,
  editable = true,
  onFocus,
  onBlur,
  ...props
}, ref) => {
  const { t } = useTranslation();
  const inputRef = React.useRef<TextInput>(null);
  const focusInput = React.useContext(FormScrollContext);
  const [passwordVisible, setPasswordVisible] = React.useState(false);

  const isPasswordField = !!secureTextEntry;
  const canToggle = isPasswordField && (showPasswordToggle ?? true);
  const hideText = isPasswordField && !passwordVisible;

  React.useImperativeHandle(ref, () => inputRef.current!);

  const trailing = canToggle ? (
    <TouchableOpacity
      onPress={() => setPasswordVisible((prev) => !prev)}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={passwordVisible ? t('auth.hidePassword') : t('auth.showPassword')}
      style={styles.eyeButton}
    >
      <Ionicons
        name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
        size={22}
        color="#6b7280"
      />
    </TouchableOpacity>
  ) : (
    rightIcon
  );

  return (
    <View style={[styles.container, style]}>
      {label ? (
        <View style={styles.labelContainer}>
          <Text style={styles.label}>
            {label}
            {required ? <Text style={styles.required}>*</Text> : null}
          </Text>
        </View>
      ) : null}
      <View
        style={[
          styles.inputWrapper,
          error ? styles.inputWrapperError : null,
          disabled ? styles.inputWrapperDisabled : null,
        ]}
      >
        {leftIcon ? <View style={styles.iconLeft}>{leftIcon}</View> : null}
        <TextInput
          {...props}
          ref={inputRef}
          style={[
            styles.input,
            hideText ? styles.inputSecure : null,
            disabled ? styles.inputDisabled : null,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          secureTextEntry={hideText}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          editable={editable && !disabled}
          onFocus={(event) => {
            focusInput?.(inputRef.current);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            focusInput?.(null);
            onBlur?.(event);
          }}
        />
        {trailing ? <View style={styles.iconRight}>{trailing}</View> : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {helperText && !error ? <Text style={styles.helperText}>{helperText}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  labelContainer: {
    marginBottom: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  required: {
    color: '#ef4444',
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 12,
  },
  inputWrapperError: {
    borderColor: '#ef4444',
  },
  inputWrapperDisabled: {
    backgroundColor: '#f9fafb',
    borderColor: '#e5e7eb',
  },
  iconLeft: {
    marginRight: 8,
    paddingVertical: 4,
  },
  iconRight: {
    marginLeft: 8,
    paddingVertical: 4,
  },
  eyeButton: {
    padding: 4,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    paddingVertical: 12,
  },
  inputSecure: {
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
  },
  inputDisabled: {
    color: '#9ca3af',
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 6,
    marginLeft: 4,
  },
  helperText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 6,
    marginLeft: 4,
  },
});

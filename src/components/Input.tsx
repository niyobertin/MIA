import React from 'react';
import { View, TextInput, Text, StyleSheet } from 'react-native';
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
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  disabled = false,
  required = false,
  editable = true,
  onFocus,
  onBlur,
  ...props
}, ref) => {
  const inputRef = React.useRef<TextInput>(null);
  const focusInput = React.useContext(FormScrollContext);
  React.useImperativeHandle(ref, () => inputRef.current!);

  return (
    <View style={[styles.container, style]}>
      {label && (
        <View style={styles.labelContainer}>
          <Text style={styles.label}>
            {label}
            {required && <Text style={styles.required}>*</Text>}
          </Text>
        </View>
      )}
      <View style={[
        styles.inputWrapper,
        error && styles.inputWrapperError,
        disabled && styles.inputWrapperDisabled,
      ]}>
        {leftIcon && <View style={styles.iconLeft}>{leftIcon}</View>}
        <TextInput
          {...props}
          ref={inputRef}
          style={[
            styles.input,
            secureTextEntry && styles.inputSecure,
            disabled && styles.inputDisabled,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          secureTextEntry={secureTextEntry}
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
        {rightIcon && <View style={styles.iconRight}>{rightIcon}</View>}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
      {helperText && !error && <Text style={styles.helperText}>{helperText}</Text>}
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
  input: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    paddingVertical: 12,
  },
  inputSecure: {
    fontFamily: 'monospace',
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

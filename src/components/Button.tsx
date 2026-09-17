import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radius } from '@/theme/tokens';

interface ButtonProps {
  title?: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
  children?: React.ReactNode;
  accessibilityLabel?: string;
  testID?: string;
}

type ViewStyle = import('react-native').ViewStyle;

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  style,
  children,
  accessibilityLabel,
  testID,
}) => {
  const isDisabled = disabled || loading;
  
  const baseStyles = [
    styles.base,
    styles[variant],
    styles[size],
    fullWidth && styles.fullWidth,
    isDisabled && styles.disabled,
    style,
  ];

  return (
    <TouchableOpacity
      style={baseStyles}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' ? '#fff' : colors.primary} />
      ) : (
        <View style={styles.content}>
          {leftIcon && <View style={styles.iconLeft}>{leftIcon}</View>}
          {children != null ? (
            React.Children.map(children, (child) => (
              typeof child === 'string' || typeof child === 'number' ? (
                <Text style={[
                  styles.text,
                  styles[`text${variant.charAt(0).toUpperCase() + variant.slice(1)}`],
                  styles[`text${size.charAt(0).toUpperCase() + size.slice(1)}`],
                ]}>{child}</Text>
              ) : child
            ))
          ) : (
            <Text style={[
              styles.text,
              styles[`text${variant.charAt(0).toUpperCase() + variant.slice(1)}`],
              styles[`text${size.charAt(0).toUpperCase() + size.slice(1)}`],
            ]}>
              {title}
            </Text>
          )}
          {rightIcon && <View style={styles.iconRight}>{rightIcon}</View>}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  fullWidth: {
    width: '100%',
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: '#eef2ff',
  },
  danger: {
    backgroundColor: colors.dangerSoft,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.5,
  },
  sm: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  md: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  lg: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
  text: {
    fontWeight: '600',
  },
  textPrimary: {
    color: '#fff',
  },
  textSecondary: {
    color: colors.primaryText,
  },
  textDanger: {
    color: colors.dangerText,
  },
  textOutline: {
    color: colors.primary,
  },
  textGhost: {
    color: colors.primary,
  },
  textSm: {
    fontSize: 13,
  },
  textMd: {
    fontSize: 15,
  },
  textLg: {
    fontSize: 17,
  },
});

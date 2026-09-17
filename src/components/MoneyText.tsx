import React from 'react';
import { Text, TextInput, TextStyle, StyleSheet, View } from 'react-native';
import { formatCurrency } from '@/utils/formatters';
import { useTranslation } from 'react-i18next';

interface MoneyTextProps {
  amount: number;
  currency?: string;
  style?: TextStyle;
  showCurrency?: boolean;
  color?: string;
  size?: number;
  weight?: TextStyle['fontWeight'];
  negativeColor?: string;
  positiveColor?: string;
  zeroColor?: string;
}

export const MoneyText: React.FC<MoneyTextProps> = ({
  amount,
  currency = 'RWF',
  style,
  showCurrency = true,
  color,
  size,
  weight,
  negativeColor = '#ef4444',
  positiveColor = '#22c55e',
  zeroColor = '#6b7280',
}) => {
  const { t } = useTranslation();
  
  const formattedAmount = formatCurrency(amount, currency);
  
  let textColor = color;
  if (!textColor) {
    if (amount > 0) textColor = positiveColor;
    else if (amount < 0) textColor = negativeColor;
    else textColor = zeroColor;
  }

  return (
    <Text
      style={[
        {
          fontSize: size,
          fontWeight: weight ?? '600',
          color: textColor,
          fontFamily: 'monospace',
        },
        style,
      ]}
    >
      {formattedAmount}
    </Text>
  );
};

export const MoneyInput: React.FC<{
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: TextStyle;
  currency?: string;
  error?: string;
}> = ({ value, onChangeText, placeholder, style, currency = 'RWF', error }) => {
  const { t } = useTranslation();
  
  const handleChange = (text: string) => {
    const numericText = text.replace(/[^\d]/g, '');
    onChangeText(numericText);
  };

  return (
    <>
      <View style={styles.inputContainer}>
        <Text style={styles.currencyLabel}>{currency} </Text>
        <TextInput
          style={[
            styles.input,
            style,
            error && styles.inputError,
          ]}
          onChangeText={handleChange}
          value={value}
          placeholder={placeholder}
          keyboardType="numeric"
          textAlign="right"
        />
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </>
  );
};

const styles = StyleSheet.create({
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  currencyLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'monospace',
    color: '#111827',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 4,
    marginLeft: 4,
  },
});
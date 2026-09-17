import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Control, FieldPath, FieldValues, useController } from 'react-hook-form';

export function FormPicker<T extends FieldValues>({
  control,
  name,
  label,
  children,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  children: React.ReactNode;
}) {
  const { field, fieldState } = useController({ control, name });
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.picker, fieldState.error && styles.invalid]}>
        <Picker
          selectedValue={field.value}
          onValueChange={field.onChange}
          onBlur={field.onBlur}
          mode="dropdown"
          accessibilityLabel={label}
        >
          {children}
        </Picker>
      </View>
      {fieldState.error && <Text style={styles.error}>{fieldState.error.message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  picker: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, backgroundColor: '#fff', overflow: 'hidden' },
  invalid: { borderColor: '#ef4444' },
  error: { fontSize: 12, color: '#ef4444', marginTop: 6 },
});

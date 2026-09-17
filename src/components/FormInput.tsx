import React from 'react';
import { Control, FieldPath, FieldPathValue, FieldValues, useController } from 'react-hook-form';
import { Input, InputProps } from './Input';

interface FormInputProps<T extends FieldValues, N extends FieldPath<T>> extends Omit<InputProps, 'value' | 'onChangeText'> {
  control: Control<T>;
  name: N;
  parseValue?: (value: string) => FieldPathValue<T, N>;
  displayValue?: string;
}

export function FormInput<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  parseValue,
  displayValue,
  error,
  ...props
}: FormInputProps<T, N>) {
  const { field, fieldState } = useController({ control, name });

  return (
    <Input
      {...props}
      ref={field.ref}
      value={displayValue ?? String(field.value ?? '')}
      onChangeText={(value) => field.onChange(parseValue ? parseValue(value) : value)}
      onBlur={field.onBlur}
      error={error ?? fieldState.error?.message}
    />
  );
}

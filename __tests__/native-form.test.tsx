import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Picker } from '@react-native-picker/picker';
import { Button } from '@/components/Button';
import { FormInput } from '@/components/FormInput';
import { FormPicker } from '@/components/FormPicker';

const schema = z.object({ name: z.string().min(2, 'Name required'), amount: z.number().int().positive(), currency: z.string() });
type Values = z.infer<typeof schema>;

function Form({ onSubmit }: { onSubmit: (values: Values) => void }) {
  const { control, handleSubmit } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', amount: 0, currency: 'RWF' },
  });
  return (
    <>
      <FormInput control={control} name="name" placeholder="Business name" />
      <FormInput control={control} name="amount" placeholder="Amount" parseValue={value => parseInt(value.replace(/[^\d]/g, ''), 10) || 0} />
      <FormPicker control={control} name="currency" label="Currency">
        <Picker.Item label="RWF" value="RWF" />
        <Picker.Item label="USD" value="USD" />
      </FormPicker>
      <Button onPress={() => handleSubmit(onSubmit)()}>Save</Button>
    </>
  );
}

it('retains native text input and submits primitive values from inputs and pickers', async () => {
  const onSubmit = jest.fn();
  const screen = render(<Form onSubmit={onSubmit} />);
  fireEvent.changeText(screen.getByPlaceholderText('Business name'), 'Kigali Shop');
  fireEvent.changeText(screen.getByPlaceholderText('Amount'), '42,000');
  fireEvent(screen.UNSAFE_getByType(Picker), 'valueChange', 'USD');
  expect(screen.getByPlaceholderText('Business name').props.value).toBe('Kigali Shop');
  expect(screen.getByPlaceholderText('Amount').props.value).toBe('42000');
  fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Kigali Shop', amount: 42000, currency: 'USD' }, undefined));
});

it('shows validation errors and lets the user correct a field', async () => {
  const onSubmit = jest.fn();
  const screen = render(<Form onSubmit={onSubmit} />);
  fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(screen.getByText('Name required')).toBeTruthy());
  expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByPlaceholderText('Business name'), 'Shop');
  fireEvent.changeText(screen.getByPlaceholderText('Amount'), '1000');
  fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
});

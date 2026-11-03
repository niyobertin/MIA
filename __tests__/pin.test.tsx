import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { PinInput } from '@/components/PinInput';
import {
  getPinProblem,
  isPinFormat,
  isWeakPin,
  pinLockDurationMs,
  sanitizePinInput,
} from '@/utils/pin';
import { hashPassword, verifyPassword } from '@/utils/password';

describe('PIN rules', () => {
  it('accepts exactly four digits', () => {
    expect(isPinFormat('4821')).toBe(true);
    expect(isPinFormat('482')).toBe(false);
    expect(isPinFormat('48210')).toBe(false);
    expect(isPinFormat('48a1')).toBe(false);
    expect(isPinFormat(' 4821')).toBe(false);
  });

  it('rejects easy-to-guess PINs', () => {
    for (const pin of ['0000', '1111', '1234', '4321', '7890', '0987', '1212', '4545']) {
      expect(isWeakPin(pin)).toBe(true);
    }
    for (const pin of ['4821', '1357', '2468', '9152', '1122']) {
      expect(isWeakPin(pin)).toBe(false);
    }
  });

  it('explains why a PIN is not allowed', () => {
    expect(getPinProblem('12')).toBe('pinInvalid');
    expect(getPinProblem('1234')).toBe('pinTooEasy');
    expect(getPinProblem('4821')).toBeNull();
  });

  it('keeps only the first four digits of typed input', () => {
    expect(sanitizePinInput('4a8-2 19')).toBe('4821');
  });

  it('locks after every fifth miss with an escalating, capped duration', () => {
    const minutes = (n: number) => pinLockDurationMs(n) / 60000;
    expect([1, 2, 3, 4, 6, 9].map(minutes)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(minutes(5)).toBe(15);
    expect(minutes(10)).toBe(30);
    expect(minutes(15)).toBe(60);
    expect(minutes(100)).toBe(24 * 60);
  });

  it('hashes PINs with a random salt', async () => {
    const a = await hashPassword('4821');
    const b = await hashPassword('4821');
    expect(a).not.toEqual(b);
    expect(await verifyPassword('4821', a)).toBe(true);
    expect(await verifyPassword('4822', a)).toBe(false);
  });
});

describe('PinInput', () => {
  it('filters non-digits and fires onComplete once four digits are entered', () => {
    const onChange = jest.fn();
    const onComplete = jest.fn();
    const { getByTestId, rerender } = render(
      <PinInput value="" onChangeText={onChange} onComplete={onComplete} testID="pin" />
    );

    fireEvent.changeText(getByTestId('pin'), '48a');
    expect(onChange).toHaveBeenLastCalledWith('48');
    expect(onComplete).not.toHaveBeenCalled();

    rerender(<PinInput value="48" onChangeText={onChange} onComplete={onComplete} testID="pin" />);
    fireEvent.changeText(getByTestId('pin'), '48219');
    expect(onChange).toHaveBeenLastCalledWith('4821');
    expect(onComplete).toHaveBeenCalledWith('4821');
  });
});

export const PIN_LENGTH = 4;
export const PIN_ATTEMPTS_BEFORE_LOCK = 5;

const BASE_LOCK_MS = 15 * 60 * 1000;
const MAX_LOCK_MS = 24 * 60 * 60 * 1000;

export type PinProblem = 'pinInvalid' | 'pinTooEasy';

export function isPinFormat(value: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(value);
}

export function isWeakPin(pin: string): boolean {
  if (!isPinFormat(pin)) return false;
  const digits = pin.split('').map(Number);
  if (digits.every((d) => d === digits[0])) return true;
  const ascending = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 1) % 10);
  const descending = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 9) % 10);
  if (ascending || descending) return true;
  return pin.slice(0, 2) === pin.slice(2);
}

export function getPinProblem(pin: string): PinProblem | null {
  if (!isPinFormat(pin)) return 'pinInvalid';
  if (isWeakPin(pin)) return 'pinTooEasy';
  return null;
}

export function sanitizePinInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, PIN_LENGTH);
}

export function pinLockDurationMs(failedAttempts: number): number {
  if (failedAttempts < PIN_ATTEMPTS_BEFORE_LOCK || failedAttempts % PIN_ATTEMPTS_BEFORE_LOCK !== 0) {
    return 0;
  }
  const level = failedAttempts / PIN_ATTEMPTS_BEFORE_LOCK - 1;
  return Math.min(BASE_LOCK_MS * 2 ** level, MAX_LOCK_MS);
}

import i18n from '@/i18n';
import { ApiError } from '@/lib/api';
import { settingsStorage } from '@/repositories/settings';
import { PinValidationError } from '@/repositories/users/users';
import { pinLockDurationMs, PIN_ATTEMPTS_BEFORE_LOCK } from '@/utils/pin';

const LAST_ACCOUNT_KEY = 'mia.auth.last_account';
const LOCK_KEY_PREFIX = 'mia.auth.lock.';

export type RememberedAccount = { email: string; name: string };

type LocalLock = { fails: number; lockedUntil: number | null };

export class PinAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PinAuthError';
  }
}

export async function getRememberedAccount(): Promise<RememberedAccount | null> {
  try {
    const raw = await settingsStorage.getItem(LAST_ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RememberedAccount;
    return parsed?.email ? parsed : null;
  } catch {
    return null;
  }
}

export async function rememberAccount(account: RememberedAccount): Promise<void> {
  try {
    await settingsStorage.setItem(LAST_ACCOUNT_KEY, JSON.stringify(account));
  } catch {
    return;
  }
}

export async function forgetRememberedAccount(): Promise<void> {
  try {
    await settingsStorage.removeItem(LAST_ACCOUNT_KEY);
  } catch {
    return;
  }
}

async function readLock(email: string): Promise<LocalLock> {
  try {
    const raw = await settingsStorage.getItem(LOCK_KEY_PREFIX + email);
    return raw ? (JSON.parse(raw) as LocalLock) : { fails: 0, lockedUntil: null };
  } catch {
    return { fails: 0, lockedUntil: null };
  }
}

function lockedMessage(untilMs: number): string {
  const minutes = Math.max(1, Math.ceil((untilMs - Date.now()) / 60000));
  return i18n.t('auth.pinLocked', { minutes });
}

export async function assertNotLockedLocally(email: string): Promise<void> {
  const lock = await readLock(email);
  if (lock.lockedUntil && lock.lockedUntil > Date.now()) {
    throw new PinAuthError(lockedMessage(lock.lockedUntil));
  }
}

export async function recordLocalFailure(email: string): Promise<string> {
  const lock = await readLock(email);
  const fails = lock.fails + 1;
  const lockMs = pinLockDurationMs(fails);
  const lockedUntil = lockMs > 0 ? Date.now() + lockMs : null;
  await settingsStorage.setItem(LOCK_KEY_PREFIX + email, JSON.stringify({ fails, lockedUntil }));
  if (lockedUntil) return lockedMessage(lockedUntil);
  return i18n.t('auth.attemptsLeft', {
    count: PIN_ATTEMPTS_BEFORE_LOCK - (fails % PIN_ATTEMPTS_BEFORE_LOCK),
  });
}

export async function clearLocalFailures(email: string): Promise<void> {
  try {
    await settingsStorage.removeItem(LOCK_KEY_PREFIX + email);
  } catch {
    return;
  }
}

export function describePinError(error: unknown): string | null {
  if (error instanceof PinAuthError) return error.message;
  if (error instanceof PinValidationError) return i18n.t(`auth.${error.problem}`);
  if (error instanceof ApiError) {
    if (error.code === 'PIN_LOCKED') {
      const seconds = Number(error.body?.retry_after_seconds ?? 900);
      return lockedMessage(Date.now() + seconds * 1000);
    }
    if (error.code === 'INVALID_CREDENTIALS') {
      const left = error.body?.attempts_left;
      return left != null
        ? i18n.t('auth.attemptsLeft', { count: Number(left) })
        : i18n.t('auth.invalidPin');
    }
    if (error.status === 429) {
      return lockedMessage(Date.now() + 15 * 60 * 1000);
    }
    const lower = error.message.toLowerCase();
    if (lower.includes('too easy')) return i18n.t('auth.pinTooEasy');
    if (lower.includes('4 digits')) return i18n.t('auth.pinInvalid');
  }
  return null;
}

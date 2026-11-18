import i18n from '@/i18n';
import { ApiError } from '@/lib/api';
import { settingsStorage } from '@/repositories/settings';
import { DuplicateAccountError, MissingIdentifierError, PinValidationError } from '@/repositories/users/users';
import { pinLockDurationMs, PIN_ATTEMPTS_BEFORE_LOCK } from '@/utils/pin';

const LAST_ACCOUNT_KEY = 'mia.auth.last_account';
const LOCK_KEY_PREFIX = 'mia.auth.lock.';

export type RememberedAccount = { identifier: string; name: string };

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
    const parsed = JSON.parse(raw) as Partial<RememberedAccount> & { email?: string };
    const identifier = parsed?.identifier ?? parsed?.email;
    return identifier ? { identifier, name: parsed.name ?? '' } : null;
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

function lockKey(identifier: string): string {
  return LOCK_KEY_PREFIX + identifier.replace(/[\s()-]/g, '').toLowerCase();
}

async function readLock(identifier: string): Promise<LocalLock> {
  try {
    const raw = await settingsStorage.getItem(lockKey(identifier));
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
  await settingsStorage.setItem(lockKey(email), JSON.stringify({ fails, lockedUntil }));
  if (lockedUntil) return lockedMessage(lockedUntil);
  return i18n.t('auth.attemptsLeft', {
    count: PIN_ATTEMPTS_BEFORE_LOCK - (fails % PIN_ATTEMPTS_BEFORE_LOCK),
  });
}

export async function clearLocalFailures(email: string): Promise<void> {
  try {
    await settingsStorage.removeItem(lockKey(email));
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
    if (error.code === 'PHONE_AMBIGUOUS') return i18n.t('auth.phoneAmbiguous');
    if (error.code === 'IDENTIFIER_INVALID') return i18n.t('auth.invalidIdentifier');
    const lower = error.message.toLowerCase();
    if (lower.includes('too easy')) return i18n.t('auth.pinTooEasy');
    if (lower.includes('4 digits')) return i18n.t('auth.pinInvalid');
  }
  return null;
}

export function describeAccountError(error: unknown): string | null {
  if (error instanceof DuplicateAccountError) {
    return i18n.t(error.field === 'email' ? 'auth.emailTaken' : 'auth.phoneTaken');
  }
  if (error instanceof MissingIdentifierError) return i18n.t(`auth.${error.problem}`);
  if (error instanceof ApiError) {
    if (error.code === 'EMAIL_TAKEN') return i18n.t('auth.emailTaken');
    if (error.code === 'PHONE_TAKEN') return i18n.t('auth.phoneTaken');
    if (error.code === 'EMAIL_INVALID') return i18n.t('auth.invalidEmail');
    if (error.code === 'PHONE_INVALID') return i18n.t('auth.invalidPhone');
    if (error.code === 'IDENTIFIER_REQUIRED') return i18n.t('auth.identifierRequired');
  }
  return describePinError(error);
}

export function describePinResetError(error: unknown): string {
  if (error instanceof Error && error.message === 'OFFLINE') return i18n.t('auth.resetNeedsInternet');
  if (error instanceof ApiError) {
    if (error.code === 'RESET_CODE_INVALID') return i18n.t('auth.resetCodeInvalid');
    if (error.status === 429) return i18n.t('auth.resetTooMany');
    const pinMessage = describePinError(error);
    if (pinMessage) return pinMessage;
  }
  return i18n.t('auth.resetFailed');
}

const DEFAULT_COUNTRY_CODE = '250';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Identifier = { kind: 'email'; value: string } | { kind: 'phone'; value: string };

export function normalizeEmail(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().toLowerCase();
  return value && EMAIL_PATTERN.test(value) ? value : null;
}

export function normalizePhone(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  let digits = trimmed.replace(/[^\d]/g, '');
  if (trimmed.startsWith('+')) {
    digits = digits.replace(/^0+/, '');
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = DEFAULT_COUNTRY_CODE + digits.slice(1);
  } else if (!digits.startsWith(DEFAULT_COUNTRY_CODE) && digits.length === 9) {
    digits = DEFAULT_COUNTRY_CODE + digits;
  }
  return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : null;
}

export function parseIdentifier(raw: string | null | undefined): Identifier | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  if (value.includes('@')) {
    const email = normalizeEmail(value);
    return email ? { kind: 'email', value: email } : null;
  }
  const phone = normalizePhone(value);
  return phone ? { kind: 'phone', value: phone } : null;
}

export function accountIdentifier(user: { email?: string | null; phone?: string | null }): string {
  return normalizeEmail(user.email) ?? normalizePhone(user.phone) ?? '';
}

export function formatPhone(phone: string | null | undefined): string {
  const normalized = normalizePhone(phone);
  if (!normalized) return phone ?? '';
  if (normalized.startsWith('+250') && normalized.length === 13) {
    const local = normalized.slice(4);
    return `+250 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return normalized;
}

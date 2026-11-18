import { ILike } from 'typeorm';
import { AppDataSource } from '../data-source';
import { User } from '../entities';

const DEFAULT_COUNTRY_CODE = process.env.DEFAULT_PHONE_COUNTRY_CODE ?? '250';
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

export async function findUsersByPhone(phone: string, excludeId?: string): Promise<User[]> {
  const tail = phone.replace(/\D/g, '').slice(-9);
  const candidates = await AppDataSource.getRepository(User)
    .createQueryBuilder('u')
    .where('u.phone IS NOT NULL')
    .andWhere(`regexp_replace(u.phone, '[^0-9]', '', 'g') LIKE :tail`, { tail: `%${tail}` })
    .getMany();
  return candidates.filter((u) => u.id !== excludeId && normalizePhone(u.phone) === phone);
}

export async function findUserByIdentifier(
  identifier: Identifier,
): Promise<{ user: User | null; ambiguous: boolean }> {
  if (identifier.kind === 'email') {
    const user = await AppDataSource.getRepository(User).findOne({ where: { email: ILike(identifier.value) } });
    return { user, ambiguous: false };
  }
  const matches = await findUsersByPhone(identifier.value);
  if (matches.length > 1) return { user: null, ambiguous: true };
  return { user: matches[0] ?? null, ambiguous: false };
}

export function identifierFromBody(body: unknown): string {
  const source = (body ?? {}) as Record<string, unknown>;
  const raw = typeof source.identifier === 'string' ? source.identifier : source.email;
  return typeof raw === 'string' ? raw : '';
}

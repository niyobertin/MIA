import { accountIdentifier, formatPhone, normalizeEmail, normalizePhone, parseIdentifier } from '@/utils/identity';

describe('identity helpers', () => {
  it('normalizes Rwandan phone numbers written different ways', () => {
    expect(normalizePhone('0788 123 456')).toBe('+250788123456');
    expect(normalizePhone('+250 788-123-456')).toBe('+250788123456');
    expect(normalizePhone('250788123456')).toBe('+250788123456');
    expect(normalizePhone('788123456')).toBe('+250788123456');
    expect(normalizePhone('00250788123456')).toBe('+250788123456');
  });

  it('rejects phone numbers that are too short', () => {
    expect(normalizePhone('0788')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });

  it('tells email and phone apart', () => {
    expect(parseIdentifier(' Owner@Example.TEST ')).toEqual({ kind: 'email', value: 'owner@example.test' });
    expect(parseIdentifier('0788123456')).toEqual({ kind: 'phone', value: '+250788123456' });
    expect(parseIdentifier('owner@')).toBeNull();
    expect(parseIdentifier('hello')).toBeNull();
  });

  it('prefers email, then phone, as the account identifier', () => {
    expect(accountIdentifier({ email: 'a@b.rw', phone: '0788123456' })).toBe('a@b.rw');
    expect(accountIdentifier({ email: null, phone: '0788123456' })).toBe('+250788123456');
    expect(normalizeEmail('bad')).toBeNull();
  });

  it('formats Rwandan numbers for display', () => {
    expect(formatPhone('0788123456')).toBe('+250 788 123 456');
  });
});

import { hashPassword, verifyPassword } from '@/utils/password';

describe('password utils', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('Owner123!');
    expect(hash.includes(':')).toBe(true);
    expect(await verifyPassword('Owner123!', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('rejects legacy unmigrated hashes', async () => {
    expect(await verifyPassword('anything', 'legacy:unmigrated')).toBe(false);
  });

  it('is deterministic for the same salt+password path', async () => {
    const a = await hashPassword('Manager123!');
    const b = await hashPassword('Manager123!');
    expect(a).not.toEqual(b); // different salts
    expect(await verifyPassword('Manager123!', a)).toBe(true);
    expect(await verifyPassword('Manager123!', b)).toBe(true);
  });
});

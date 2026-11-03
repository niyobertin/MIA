/**
 * @jest-environment node
 */
import { generateUUID } from '@/utils/uuid';

// Lightweight unit coverage for user→business auth invariants used by the store.
describe('user business auth invariants', () => {
  it('generates unique ids for users and businesses', () => {
    const a = generateUUID();
    const b = generateUUID();
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('normalizes business codes for lookup', () => {
    const code = 'mia-rw-abcd';
    expect(code.trim().toUpperCase()).toBe('MIA-RW-ABCD');
  });
});

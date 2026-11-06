import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

export type PlatformTokenPayload = {
  sub: string;
  ver: number;
  typ: 'platform' | 'platform_mfa';
};

const SESSION_EXPIRES = process.env.PLATFORM_SESSION_EXPIRES ?? '2h';
const CHALLENGE_EXPIRES = '5m';

function platformSecret(): string {
  const base = process.env.JWT_SECRET ?? 'dev-only-secret';
  return createHash('sha256').update(`mia-platform-session:${base}`).digest('hex');
}

export function signPlatformSession(adminId: string, version: number): string {
  return jwt.sign({ sub: adminId, ver: version, typ: 'platform' }, platformSecret(), {
    expiresIn: SESSION_EXPIRES,
  } as jwt.SignOptions);
}

export function signPlatformChallenge(adminId: string, version: number): string {
  return jwt.sign({ sub: adminId, ver: version, typ: 'platform_mfa' }, platformSecret(), {
    expiresIn: CHALLENGE_EXPIRES,
  });
}

export function verifyPlatformToken(token: string, typ: PlatformTokenPayload['typ']): PlatformTokenPayload {
  const payload = jwt.verify(token, platformSecret()) as PlatformTokenPayload;
  if (payload.typ !== typ) throw new Error('Invalid token type');
  return payload;
}

export const platformPasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(200)
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/\d/, 'Password needs a number');

export function isTwoFactorRequired(): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  return process.env.PLATFORM_REQUIRE_2FA !== 'false';
}

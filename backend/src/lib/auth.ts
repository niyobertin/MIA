import 'dotenv/config';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const DEV_JWT_SECRET = 'dev-insecure-secret-change-me';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const BCRYPT_ROUNDS = 12;

function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  const publicDefault = !secret || secret === DEV_JWT_SECRET || secret.startsWith('change-me');
  if (publicDefault) {
    if (IS_PRODUCTION) {
      throw new Error('JWT_SECRET must be set to a private random value in production');
    }
    console.warn('JWT_SECRET is missing or weak — using an insecure development secret.');
    return secret || DEV_JWT_SECRET;
  }
  if (secret.length < 32) {
    console.warn('JWT_SECRET is shorter than 32 characters. Replace it with: openssl rand -hex 32');
  }
  return secret;
}

const JWT_SECRET = resolveJwtSecret();
const JWT_ACCESS_EXPIRES = process.env.JWT_EXPIRES ?? '12h';
const JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES ?? '30d';

export type AuthTokenPayload = {
  sub: string;
  email: string;
  business_id: string | null;
  typ?: 'access' | 'refresh';
};

function isBcryptHash(hash: string): boolean {
  return hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$');
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Legacy `${saltHex}:${sha256Hex}` hashes (created by the mobile app) should be upgraded after login. */
export function needsRehash(storedHash: string): boolean {
  return !isBcryptHash(storedHash);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || storedHash === 'legacy:unmigrated') return false;

  if (isBcryptHash(storedHash)) {
    return bcrypt.compare(password, storedHash);
  }

  const sep = storedHash.indexOf(':');
  if (sep <= 0) return false;
  const salt = storedHash.slice(0, sep);
  const digest = storedHash.slice(sep + 1);
  if (!salt || !digest) return false;

  const candidate = Buffer.from(crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex'));
  const expected = Buffer.from(digest);
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export function signAccessToken(payload: Omit<AuthTokenPayload, 'typ'>): string {
  return jwt.sign({ ...payload, typ: 'access' }, JWT_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRES,
  } as jwt.SignOptions);
}

export function signRefreshToken(payload: Omit<AuthTokenPayload, 'typ'>): string {
  return jwt.sign({ ...payload, typ: 'refresh' }, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES,
  } as jwt.SignOptions);
}

/** @deprecated use signAccessToken */
export function signToken(payload: Omit<AuthTokenPayload, 'typ'>): string {
  return signAccessToken(payload);
}

export function issueTokenPair(payload: Omit<AuthTokenPayload, 'typ'>) {
  return {
    token: signAccessToken(payload),
    refresh_token: signRefreshToken(payload),
  };
}

export function verifyToken(token: string, expectTyp?: 'access' | 'refresh'): AuthTokenPayload {
  const payload = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  // Older tokens may omit typ — treat them as access
  const typ = payload.typ ?? 'access';
  if (expectTyp && typ !== expectTyp) {
    throw new Error('Invalid token type');
  }
  return { ...payload, typ };
}

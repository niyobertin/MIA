import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me';
const JWT_ACCESS_EXPIRES = process.env.JWT_EXPIRES ?? '12h';
const JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES ?? '30d';

export type AuthTokenPayload = {
  sub: string;
  email: string;
  business_id: string | null;
  typ?: 'access' | 'refresh';
};

/** Match the mobile app hash format: `${saltHex}:${sha256Hex}` */
export async function hashPassword(password: string): Promise<string> {
  const salt = uuidv4().replace(/-/g, '');
  const digest = crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
  return `${salt}:${digest}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || storedHash === 'legacy:unmigrated') return false;

  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
    return bcrypt.compare(password, storedHash);
  }

  const sep = storedHash.indexOf(':');
  if (sep <= 0) return false;
  const salt = storedHash.slice(0, sep);
  const digest = storedHash.slice(sep + 1);
  if (!salt || !digest) return false;

  const candidate = crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
  return candidate === digest;
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

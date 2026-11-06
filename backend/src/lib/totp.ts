import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

const STEP_SECONDS = 30;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of input) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

export function currentTotpStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / STEP_SECONDS);
}

export function findTotpStep(secret: string, code: string, afterStep: number, nowMs = Date.now()): number | null {
  const current = currentTotpStep(nowMs);
  const supplied = Buffer.from(code);
  for (const step of [current - 1, current, current + 1]) {
    if (step <= afterStep) continue;
    const expected = Buffer.from(totpCode(secret, step));
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) return step;
  }
  return null;
}

export function totpUri(secret: string, email: string): string {
  const label = encodeURIComponent(`MIA Platform:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent('MIA Platform')}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

function encryptionKey(): Buffer {
  const material = process.env.JWT_SECRET ?? 'dev-only-secret';
  return createHash('sha256').update(`mia-platform-totp:${material}`).digest();
}

export function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64')).join('.');
}

export function decryptSecret(stored: string): string {
  const [iv, tag, encrypted] = stored.split('.').map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

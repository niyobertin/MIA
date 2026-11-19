import { randomInt, randomUUID } from 'crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../data-source';
import { Business, PinHelpRequest, PinResetCode, User, UserLoginEvent } from '../entities';
import {
  hashPassword,
  issueTokenPair,
  needsRehash,
  verifyPassword,
  verifyToken,
} from '../lib/auth';
import { emailAndIpKey, rateLimit } from '../middleware/security';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { isBusinessSuspended, SUSPENDED_RESPONSE } from '../lib/businessState';
import { formatEventTime, queueTemplateEmail, sendSensitiveTemplateEmail } from '../lib/email';
import { getPinProblem, isPinFormat, pinLockDurationMs, PIN_ATTEMPTS_BEFORE_LOCK } from '../lib/pin';
import {
  findUserByIdentifier,
  findUsersByPhone,
  identifierFromBody,
  normalizeEmail,
  normalizePhone,
  parseIdentifier,
} from '../lib/identity';

export const authRouter = Router();

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const loginLimiter = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 10, key: emailAndIpKey });
const loginIpLimiter = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 50 });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });
const lookupLimiter = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 30 });
const refreshLimiter = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 60 });
const pinResetLimiter = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 10, key: emailAndIpKey });
const pinResetIpLimiter = rateLimit({ windowMs: FIFTEEN_MINUTES, max: 30 });
const pinHelpLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });

const INVALID_CREDENTIALS = { error: 'Wrong email, phone number or PIN', code: 'INVALID_CREDENTIALS' };
const IDENTIFIER_INVALID = { error: 'Enter a valid email address or phone number', code: 'IDENTIFIER_INVALID' };

const RESET_CODE_TTL_MS = FIFTEEN_MINUTES;
const RESET_CODE_RESEND_MS = 60 * 1000;
const RESET_CODE_MAX_ATTEMPTS = 5;
const RESET_CODE_INVALID = {
  error: 'That code is wrong or has expired. Request a new one and try again.',
  code: 'RESET_CODE_INVALID',
};

const pinSchema = z.string().superRefine((value, ctx) => {
  const problem = getPinProblem(value);
  if (problem === 'pinInvalid') ctx.addIssue({ code: 'custom', message: 'PIN must be exactly 4 digits' });
  if (problem === 'pinTooEasy') ctx.addIssue({ code: 'custom', message: 'This PIN is too easy to guess' });
});

const registerSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().optional().nullable(),
  password: pinSchema,
  phone: z.string().trim().optional().nullable(),
});

const loginSchema = z.object({
  password: z.string().min(4).max(200),
});

const changePinSchema = z.object({
  current: z.string().min(4).max(200),
  pin: pinSchema,
});

const pinHelpSchema = z.object({
  name: z.string().trim().min(2).max(100),
  contact_phone: z.string().trim().max(30).optional().nullable(),
  message: z.string().trim().max(500).optional().nullable(),
});

const resetPinSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'The code must be 6 digits'),
  pin: pinSchema,
});

function lockedResponse(lockedUntil: Date) {
  const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
  return {
    error: 'Too many wrong PIN attempts. Try again later.',
    code: 'PIN_LOCKED',
    retry_after_seconds: retryAfterSeconds,
  };
}

async function checkSecret(user: User, secret: string): Promise<
  | { ok: true }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const users = AppDataSource.getRepository(User);
  const now = new Date();

  if (user.locked_until && user.locked_until > now) {
    return { ok: false, status: 423, body: lockedResponse(user.locked_until) };
  }

  const valid = await verifyPassword(secret, user.password_hash);
  if (!valid) {
    const attempts = (user.failed_login_attempts ?? 0) + 1;
    const lockMs = pinLockDurationMs(attempts);
    const lockedUntil = lockMs > 0 ? new Date(now.getTime() + lockMs) : null;
    await users.update(user.id, { failed_login_attempts: attempts, locked_until: lockedUntil });
    if (lockedUntil) {
      if (user.email) {
        void queueTemplateEmail({ template: 'auth.suspicious_login', to: user.email, businessId: user.business_id, idempotencyKey: `locked:${user.id}:${lockedUntil.toISOString()}`, variables: { recipient_name: user.name, event_time: formatEventTime(now) } });
      }
      return { ok: false, status: 423, body: lockedResponse(lockedUntil) };
    }
    return {
      ok: false,
      status: 401,
      body: {
        ...INVALID_CREDENTIALS,
        attempts_left: PIN_ATTEMPTS_BEFORE_LOCK - (attempts % PIN_ATTEMPTS_BEFORE_LOCK),
      },
    };
  }

  const updates: Partial<User> = {};
  if (user.failed_login_attempts || user.locked_until) {
    updates.failed_login_attempts = 0;
    updates.locked_until = null;
  }
  if (needsRehash(user.password_hash)) {
    updates.password_hash = await hashPassword(secret);
  }
  if (Object.keys(updates).length > 0) {
    await users.update(user.id, updates);
    Object.assign(user, updates);
  }
  return { ok: true };
}

const refreshSchema = z.object({
  refresh_token: z.string().min(20).optional(),
});

function publicUser(user: User) {
  return {
    id: user.id,
    business_id: user.business_id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    active: user.active,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

function tokensFor(user: User) {
  return issueTokenPair({
    sub: user.id,
    email: user.email,
    business_id: user.business_id,
    ver: user.token_version ?? 0,
  });
}

authRouter.post('/register', registerLimiter, async (req, res) => {
  try {
    const body = registerSchema.parse(req.body);
    const rawEmail = body.email?.trim() ?? '';
    const rawPhone = body.phone?.trim() ?? '';
    const email = rawEmail ? normalizeEmail(rawEmail) : null;
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    if (rawEmail && !email) {
      res.status(400).json({ error: 'Enter a valid email address', code: 'EMAIL_INVALID' });
      return;
    }
    if (rawPhone && !phone) {
      res.status(400).json({ error: 'Enter a valid phone number', code: 'PHONE_INVALID' });
      return;
    }
    if (!email && !phone) {
      res.status(400).json({ error: 'Enter an email address or a phone number', code: 'IDENTIFIER_REQUIRED' });
      return;
    }

    const users = AppDataSource.getRepository(User);
    if (email && (await findUserByIdentifier({ kind: 'email', value: email })).user) {
      res.status(409).json({ error: 'An account with this email already exists', code: 'EMAIL_TAKEN' });
      return;
    }
    if (phone && (await findUsersByPhone(phone)).length > 0) {
      res.status(409).json({ error: 'An account with this phone number already exists', code: 'PHONE_TAKEN' });
      return;
    }

    const now = new Date();
    const user = users.create({
      id: randomUUID(),
      business_id: null,
      name: body.name.trim(),
      email,
      phone,
      password_hash: await hashPassword(body.password),
      role: null,
      active: true,
      created_at: now,
      updated_at: now,
    });
    await users.save(user);

    res.status(201).json({
      ...tokensFor(user),
      user: publicUser(user),
      business: null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Could not create account' });
  }
});

authRouter.post('/login', loginIpLimiter, loginLimiter, async (req, res) => {
  try {
    const body = loginSchema.parse(req.body);
    const identifier = parseIdentifier(identifierFromBody(req.body));
    if (!identifier) {
      res.status(400).json(IDENTIFIER_INVALID);
      return;
    }
    const businesses = AppDataSource.getRepository(Business);

    const { user, ambiguous } = await findUserByIdentifier(identifier);
    if (ambiguous) {
      res.status(409).json({
        error: 'More than one account uses this phone number. Sign in with your email, or ask MIA support for help.',
        code: 'PHONE_AMBIGUOUS',
      });
      return;
    }
    if (!user || !user.active) {
      res.status(401).json(INVALID_CREDENTIALS);
      return;
    }

    const check = await checkSecret(user, body.password);
    if (!check.ok) {
      await recordLoginEvent(req, user, false);
      res.status(check.status).json(check.body);
      return;
    }

    if (await isBusinessSuspended(user.business_id)) {
      await recordLoginEvent(req, user, false);
      res.status(403).json(SUSPENDED_RESPONSE);
      return;
    }

    await recordLoginEvent(req, user, true);
    const business = user.business_id
      ? await businesses.findOne({ where: { id: user.business_id } })
      : null;

    res.json({
      ...tokensFor(user),
      user: publicUser(user),
      business,
      pin_setup_required: !isPinFormat(body.password) || user.must_change_pin,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Could not sign in' });
  }
});

async function recordLoginEvent(req: Request, user: User, success: boolean) {
  try {
    const now = new Date();
    await AppDataSource.getRepository(UserLoginEvent).insert({
      id: randomUUID(),
      user_id: user.id,
      business_id: user.business_id,
      success,
      ip: req.ip ?? null,
      user_agent: String(req.headers['user-agent'] ?? '').slice(0, 200) || null,
      created_at: now,
    });
    if (success) {
      const [seen] = await AppDataSource.query(
        `SELECT EXISTS (SELECT 1 FROM user_login_events WHERE user_id = $1 AND success AND ip IS NOT DISTINCT FROM $2 AND created_at < $3) AS same_ip,
                EXISTS (SELECT 1 FROM user_login_events WHERE user_id = $1 AND success AND created_at < $3) AS any_before`,
        [user.id, req.ip ?? null, now],
      );
      await AppDataSource.getRepository(User).update(user.id, { last_login_at: now });
      if (user.email && seen?.any_before && !seen?.same_ip) {
        void queueTemplateEmail({ template: 'auth.new_login', to: user.email, businessId: user.business_id, variables: { recipient_name: user.name, event_time: formatEventTime(now), ip_address: req.ip ?? 'unknown', device: String(req.headers['user-agent'] ?? 'Unknown device').slice(0, 80) } });
      }
    }
  } catch (error) {
    console.error('Could not record sign-in', error);
  }
}

export async function issuePinResetCode(user: User) {
  if (!user.active || !user.email) return;

  const codes = AppDataSource.getRepository(PinResetCode);
  const existing = await codes.findOne({ where: { user_id: user.id } });
  const now = Date.now();
  if (existing && now - existing.created_at.getTime() < RESET_CODE_RESEND_MS) return;

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await codes.save(
    codes.create({
      user_id: user.id,
      code_hash: await hashPassword(code),
      expires_at: new Date(now + RESET_CODE_TTL_MS),
      attempts: 0,
      created_at: new Date(now),
    }),
  );

  await sendSensitiveTemplateEmail({
    template: 'auth.password_reset',
    to: user.email,
    businessId: user.business_id,
    variables: { recipient_name: user.name, verification_code: code, expiration_time: '15 minutes' },
  });
}

authRouter.post('/forgot-pin', pinResetIpLimiter, pinResetLimiter, async (req, res) => {
  const identifier = parseIdentifier(identifierFromBody(req.body));
  if (!identifier) {
    res.status(400).json(IDENTIFIER_INVALID);
    return;
  }
  res.json({ ok: true });
  findUserByIdentifier(identifier)
    .then(({ user }) => (user ? issuePinResetCode(user) : undefined))
    .catch((error) => {
      console.error('Could not send PIN reset email', error);
    });
});

authRouter.post('/pin-help', pinHelpLimiter, async (req, res) => {
  try {
    const body = pinHelpSchema.parse(req.body);
    const identifier = parseIdentifier(identifierFromBody(req.body));
    if (!identifier) {
      res.status(400).json(IDENTIFIER_INVALID);
      return;
    }
    const rawContact = body.contact_phone?.trim() ?? '';
    const contactPhone = rawContact ? normalizePhone(rawContact) : identifier.kind === 'phone' ? identifier.value : null;
    if (rawContact && !contactPhone) {
      res.status(400).json({ error: 'Enter a valid phone number', code: 'PHONE_INVALID' });
      return;
    }

    const { user } = await findUserByIdentifier(identifier);
    const requests = AppDataSource.getRepository(PinHelpRequest);
    const now = new Date();
    const open = await requests.findOne({ where: { identifier: identifier.value, status: 'open' } });
    if (open) {
      await requests.update(open.id, {
        name: body.name,
        contact_phone: contactPhone,
        message: body.message?.trim() || open.message,
        user_id: user?.id ?? null,
        updated_at: now,
      });
    } else {
      await requests.insert({
        id: randomUUID(),
        identifier: identifier.value,
        user_id: user?.id ?? null,
        name: body.name,
        contact_phone: contactPhone,
        message: body.message?.trim() || null,
        status: 'open',
        resolved_by: null,
        resolution_note: null,
        created_at: now,
        updated_at: now,
      });
    }
    res.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Could not send your request' });
  }
});

authRouter.post('/reset-pin', pinResetIpLimiter, pinResetLimiter, async (req, res) => {
  try {
    const body = resetPinSchema.parse(req.body);
    const identifier = parseIdentifier(identifierFromBody(req.body));
    const user = identifier ? (await findUserByIdentifier(identifier)).user : null;
    if (!user || !user.active) {
      await hashPassword(body.code);
      res.status(400).json(RESET_CODE_INVALID);
      return;
    }

    const newHash = await hashPassword(body.pin);
    const reset = await AppDataSource.transaction(async (manager) => {
      const record = await manager.findOne(PinResetCode, {
        where: { user_id: user.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!record) return false;
      if (record.expires_at.getTime() <= Date.now() || record.attempts >= RESET_CODE_MAX_ATTEMPTS) {
        await manager.delete(PinResetCode, { user_id: user.id });
        return false;
      }
      if (!(await verifyPassword(body.code, record.code_hash))) {
        const attempts = record.attempts + 1;
        if (attempts >= RESET_CODE_MAX_ATTEMPTS) {
          await manager.delete(PinResetCode, { user_id: user.id });
        } else {
          await manager.update(PinResetCode, { user_id: user.id }, { attempts });
        }
        return false;
      }
      await manager.update(User, { id: user.id }, {
        password_hash: newHash,
        failed_login_attempts: 0,
        locked_until: null,
        must_change_pin: false,
        token_version: (user.token_version ?? 0) + 1,
        updated_at: new Date(),
      });
      await manager.delete(PinResetCode, { user_id: user.id });
      return true;
    });

    if (!reset) {
      res.status(400).json(RESET_CODE_INVALID);
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues[0]?.message ?? 'Invalid input', code: 'PIN_INVALID' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Could not reset PIN' });
  }
});

authRouter.post('/change-pin', loginLimiter, requireAuth, async (req: AuthedRequest, res) => {
  try {
    const body = changePinSchema.parse(req.body);
    const users = AppDataSource.getRepository(User);
    const user = await users.findOne({ where: { id: req.auth!.sub } });
    if (!user || !user.active) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const check = await checkSecret(user, body.current);
    if (!check.ok) {
      res.status(check.status).json(check.body);
      return;
    }

    await users.update(user.id, {
      password_hash: await hashPassword(body.pin),
      failed_login_attempts: 0,
      locked_until: null,
      must_change_pin: false,
      updated_at: new Date(),
    });
    if (user.email) void queueTemplateEmail({ template: 'auth.password_changed', to: user.email, businessId: user.business_id, variables: { recipient_name: user.name, event_time: formatEventTime(new Date()) } });
    res.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues[0]?.message ?? 'Invalid input', code: 'PIN_INVALID' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Could not change PIN' });
  }
});

authRouter.get('/me', async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const payload = verifyToken(header.slice(7), 'access');
    const users = AppDataSource.getRepository(User);
    const businesses = AppDataSource.getRepository(Business);

    const user = await users.findOne({ where: { id: payload.sub } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const business = user.business_id
      ? await businesses.findOne({ where: { id: user.business_id } })
      : null;

    res.json({ user: publicUser(user), business });
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

authRouter.get('/business-by-code/:code', lookupLimiter, async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    verifyToken(header.slice(7), 'access');
    const code = String(req.params.code ?? '').trim().toUpperCase();
    if (!code) {
      res.status(400).json({ error: 'Business code is required' });
      return;
    }
    const business = await AppDataSource.getRepository(Business).findOne({
      where: { business_code: code },
    });
    if (!business) {
      res.status(404).json({ error: 'Business not found' });
      return;
    }
    res.json({
      business: {
        id: business.id,
        name: business.name,
        business_code: business.business_code,
        currency: business.currency,
        country: business.country,
        timezone: business.timezone,
        created_at: business.created_at,
        updated_at: business.updated_at,
      },
    });
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

const joinSchema = z.object({
  code: z.string().min(3),
});

authRouter.post('/join-business', lookupLimiter, async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const payload = verifyToken(header.slice(7), 'access');
    const body = joinSchema.parse(req.body);
    const code = body.code.trim().toUpperCase();

    const users = AppDataSource.getRepository(User);
    const businesses = AppDataSource.getRepository(Business);

    const user = await users.findOne({ where: { id: payload.sub } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (user.business_id) {
      res.status(409).json({ error: 'You already belong to a business' });
      return;
    }

    const business = await businesses.findOne({ where: { business_code: code } });
    if (!business) {
      res.status(404).json({ error: 'Business not found. Check the business code and try again.' });
      return;
    }

    user.business_id = business.id;
    user.role = 'STAFF';
    user.updated_at = new Date();
    await users.save(user);

    res.json({
      ...tokensFor(user),
      user: publicUser(user),
      business,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Could not join business' });
  }
});

/**
 * Refresh access token using refresh_token from body (preferred)
 * or a still-valid access/refresh Bearer token.
 */
authRouter.post('/refresh', refreshLimiter, async (req, res) => {
  try {
    const body = refreshSchema.parse(req.body ?? {});
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const raw = body.refresh_token || bearer;
    if (!raw) {
      res.status(401).json({ error: 'Missing refresh token' });
      return;
    }

    // Accept refresh tokens; also accept legacy access tokens for migration
    let payload;
    try {
      payload = verifyToken(raw, 'refresh');
    } catch {
      payload = verifyToken(raw);
    }

    const users = AppDataSource.getRepository(User);
    const businesses = AppDataSource.getRepository(Business);

    const user = await users.findOne({ where: { id: payload.sub } });
    if (!user || !user.active || (user.token_version ?? 0) !== (payload.ver ?? 0)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (await isBusinessSuspended(user.business_id)) {
      res.status(403).json(SUSPENDED_RESPONSE);
      return;
    }

    const business = user.business_id
      ? await businesses.findOne({ where: { id: user.business_id } })
      : null;

    res.json({
      ...tokensFor(user),
      user: publicUser(user),
      business,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    res.status(401).json({ error: 'Unauthorized' });
  }
});

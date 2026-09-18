import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { ILike } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Business, User } from '../entities';
import {
  hashPassword,
  issueTokenPair,
  verifyPassword,
  verifyToken,
} from '../lib/auth';

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional().nullable(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

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
  });
}

authRouter.post('/register', async (req, res) => {
  try {
    const body = registerSchema.parse(req.body);
    const email = body.email.trim().toLowerCase();
    const users = AppDataSource.getRepository(User);

    const existing = await users.findOne({ where: { email: ILike(email) } });
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists' });
      return;
    }

    const now = new Date();
    const user = users.create({
      id: uuidv4(),
      business_id: null,
      name: body.name.trim(),
      email,
      phone: body.phone?.trim() || null,
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

authRouter.post('/login', async (req, res) => {
  try {
    const body = loginSchema.parse(req.body);
    const email = body.email.trim().toLowerCase();
    const users = AppDataSource.getRepository(User);
    const businesses = AppDataSource.getRepository(Business);

    const user = await users.findOne({ where: { email: ILike(email) } });
    if (!user || !user.active) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const ok = await verifyPassword(body.password, user.password_hash);
    if (!ok) {
      res.status(401).json({ error: 'Invalid email or password' });
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
    console.error(error);
    res.status(500).json({ error: 'Could not sign in' });
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

authRouter.get('/business-by-code/:code', async (req, res) => {
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
  role: z.enum(['MANAGER', 'CASHIER', 'STAFF']).optional(),
});

authRouter.post('/join-business', async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const payload = verifyToken(header.slice(7), 'access');
    const body = joinSchema.parse(req.body);
    const code = body.code.trim().toUpperCase();
    const role = body.role ?? 'STAFF';

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
    user.role = role;
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
authRouter.post('/refresh', async (req, res) => {
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
    if (!user || !user.active) {
      res.status(401).json({ error: 'Unauthorized' });
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

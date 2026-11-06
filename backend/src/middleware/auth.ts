import { Request, Response, NextFunction } from 'express';
import { verifyToken, AuthTokenPayload } from '../lib/auth';
import { AppDataSource } from '../data-source';
import { User } from '../entities';
import { isBusinessSuspended, SUSPENDED_RESPONSE } from '../lib/businessState';

export type AuthedRequest = Request & {
  auth?: AuthTokenPayload;
  member?: User;
};

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }
  try {
    // Prefer access tokens; allow legacy tokens without typ
    try {
      req.auth = verifyToken(header.slice(7), 'access');
    } catch {
      req.auth = verifyToken(header.slice(7));
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export async function requireActiveUser(req: AuthedRequest, res: Response, next: NextFunction) {
  const user = await AppDataSource.getRepository(User).findOne({ where: { id: req.auth!.sub } });
  if (!user || !user.active || (user.token_version ?? 0) !== (req.auth!.ver ?? 0)) {
    res.status(401).json({ error: 'Your session has ended. Please sign in again.', code: 'SESSION_REVOKED' });
    return;
  }
  if (await isBusinessSuspended(user.business_id)) {
    res.status(403).json(SUSPENDED_RESPONSE);
    return;
  }
  req.member = user;
  next();
}

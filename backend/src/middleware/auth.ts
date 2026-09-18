import { Request, Response, NextFunction } from 'express';
import { verifyToken, AuthTokenPayload } from '../lib/auth';

export type AuthedRequest = Request & {
  auth?: AuthTokenPayload;
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

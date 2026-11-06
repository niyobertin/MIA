import type { NextFunction, Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { PlatformAdmin } from '../entities';
import { verifyPlatformToken } from '../lib/platformAuth';
import { hasPlatformPermission, type PlatformPermission } from '../lib/rbac';

export type PlatformRequest = Request & { admin?: PlatformAdmin };

export async function requirePlatformAuth(req: PlatformRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  let payload;
  try {
    payload = verifyPlatformToken(header.slice(7), 'platform');
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const admin = await AppDataSource.getRepository(PlatformAdmin).findOne({ where: { id: payload.sub } });
  if (!admin || !admin.active || admin.token_version !== payload.ver) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  req.admin = admin;
  next();
}

export function requirePasswordCurrent(req: PlatformRequest, res: Response, next: NextFunction) {
  if (req.admin?.must_change_password) {
    res.status(403).json({ error: 'Change your password to continue', code: 'PASSWORD_CHANGE_REQUIRED' });
    return;
  }
  next();
}

export function requirePermission(permission: PlatformPermission) {
  return (req: PlatformRequest, res: Response, next: NextFunction) => {
    if (!req.admin || !hasPlatformPermission(req.admin.role, permission)) {
      res.status(403).json({ error: 'You do not have permission to do this', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
}

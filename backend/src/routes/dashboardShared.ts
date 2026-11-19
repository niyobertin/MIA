import type { NextFunction, Response } from 'express';
import { z } from 'zod';
import type { Business } from '../entities';
import type { AuthedRequest } from '../middleware/auth';
import { hasDashboardPermission, type BusinessRole, type DashboardPermission } from '../lib/rbac';
import { BooksError, type BooksActor } from '../books/core';
import { parsePeriodQuery, periodBounds, safeTimezone } from '../lib/businessData';

export type DashboardRequest = AuthedRequest & { business?: Business; flags?: Record<string, boolean> };

export function can(permission: DashboardPermission) {
  return (req: DashboardRequest, res: Response, next: NextFunction) => {
    if (!hasDashboardPermission(req.member?.role, permission)) {
      res.status(403).json({ error: 'Your role does not have access to this', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
}

export function bizId(req: DashboardRequest) {
  return req.member!.business_id as string;
}

export function actorOf(req: DashboardRequest): BooksActor {
  return {
    businessId: bizId(req),
    userId: req.member!.id,
    role: (req.member!.role ?? 'STAFF') as BusinessRole,
    timezone: req.business?.timezone ?? 'Africa/Kigali',
  };
}

const MESSAGES: Record<string, string> = {
  DAY_CLOSED: 'Start the day first. Money and stock only move while a day is open.',
  DAY_ALREADY_OPEN: 'A day is already open.',
  INSUFFICIENT_STOCK: 'Not enough stock for this.',
  CREDIT_LIMIT: 'This sale would go over the customer\'s credit limit.',
  CUSTOMER_REQUIRED: 'Choose a customer for a credit sale.',
  BELOW_COST: 'This price is below what the item cost.',
  INVALID_QUANTITY: 'Quantity must be a whole number above zero.',
  INVALID_PRICE: 'Enter an amount above zero.',
  REASON_REQUIRED: 'Give a reason.',
  FORBIDDEN: 'Your role cannot do this.',
  NOT_FOUND: 'Not found.',
  PRODUCT_NOT_FOUND: 'Product not found.',
  NOT_TRACKED: 'This product does not track stock.',
  OVERPAYMENT: 'That is more than is owed.',
  NAME_TAKEN: 'That name is already used.',
  ALREADY_VOID: 'This was already cancelled.',
  HISTORY_LOCKED: 'This belongs to a closed day and cannot be changed.',
  ITEMS_REQUIRED: 'Add at least one item.',
};

/** Sends books errors with the phone's code plus a plain message; anything else is a 400 for bad input or a 500. */
export function sendError(res: Response, error: unknown) {
  if (error instanceof BooksError) {
    res.status(error.status).json({ error: MESSAGES[error.code] ?? error.code, code: error.code, ...error.extra });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: error.issues[0]?.message ?? 'Check the form and try again', code: 'INVALID_INPUT' });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Something went wrong. Nothing was saved.', code: 'SERVER_ERROR' });
}

export type ListWindow = { from: Date | null; to: Date | null; orderBy: string };

/**
 * Reads the shared list filters: `period` (today | yesterday | 7d | 30d | 90d | custom with from/to, or all),
 * `sort_by` (a key of `sortable`) and `sort` (asc | desc). Column SQL only ever comes from `sortable`.
 */
export async function listWindow(
  req: { query: Record<string, unknown>; business?: { timezone?: string | null } },
  sortable: Record<string, string>,
  defaultKey: string,
  defaultDirection: 'asc' | 'desc' = 'desc',
): Promise<ListWindow | { error: string }> {
  const rawKey = typeof req.query.sort_by === 'string' ? req.query.sort_by : defaultKey;
  const key = Object.prototype.hasOwnProperty.call(sortable, rawKey) ? rawKey : defaultKey;
  const direction = req.query.sort === 'asc' ? 'ASC' : req.query.sort === 'desc' ? 'DESC' : defaultDirection.toUpperCase();
  const orderBy = `${sortable[key]} ${direction} NULLS LAST`;
  const period = typeof req.query.period === 'string' ? req.query.period : 'all';
  if (period === 'all') return { from: null, to: null, orderBy };
  const parsed = parsePeriodQuery(req.query);
  if ('error' in parsed) return parsed;
  const bounds = await periodBounds(parsed.period, safeTimezone(req.business?.timezone ?? 'Africa/Kigali'), parsed.custom);
  return { from: bounds.from, to: bounds.to, orderBy };
}

/** SQL limiting `column` to the window; `n` is the 1-based index of the `from` parameter and `to` is `n + 1`. */
export function windowWhere(column: string, n: number) {
  const from = `$${n}`;
  const to = `$${n + 1}`;
  return `(${from}::timestamptz IS NULL OR ${column} >= ${from}) AND (${to}::timestamptz IS NULL OR ${column} < ${to})`;
}

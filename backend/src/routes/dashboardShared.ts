import type { NextFunction, Response } from 'express';
import { z } from 'zod';
import type { Business } from '../entities';
import type { AuthedRequest } from '../middleware/auth';
import { hasDashboardPermission, type BusinessRole, type DashboardPermission } from '../lib/rbac';
import { BooksError, type BooksActor } from '../books/core';

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

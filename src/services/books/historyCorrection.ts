import { paymentRepository } from '@/repositories/payments/payments';
import { queueSync } from '@/services/sync/queue';
import { generateUUID } from '@/utils/uuid';
import { getTodayDateString } from '@/utils/formatters';
import { UserRole } from '@/types';
import { requireOpenSession } from './session';
import { adjustStock, StockAdjustmentKind } from './adjustStock';
import { audit } from './audit';
import { guardError } from './guards';

export type HistoryCorrectionKind = 'cash_in' | 'cash_out' | 'stock_in' | 'stock_out' | 'stock_damage';

/**
 * Audited compensating entry in the *current* open session.
 * Never mutates closed-session rows — those stay HISTORY_LOCKED.
 */
export async function postHistoryCorrection(input: {
  businessId: string;
  userId: string;
  deviceId: string;
  role: UserRole | null;
  kind: HistoryCorrectionKind;
  reason: string;
  amount?: number;
  productId?: string;
  quantity?: number;
  originalEntity?: string | null;
  originalEntityId?: string | null;
}): Promise<{ paymentId?: string; kind: HistoryCorrectionKind }> {
  if (input.role !== 'OWNER' && input.role !== 'MANAGER') {
    throw guardError('NO_PERMISSION');
  }
  const reason = input.reason.trim();
  if (reason.length < 5) throw guardError('REASON_REQUIRED');

  const session = await requireOpenSession(input.businessId);
  const today = getTodayDateString();
  const note = `[correction] ${reason}`;

  if (input.kind === 'cash_in' || input.kind === 'cash_out') {
    const amount = input.amount ?? 0;
    if (!Number.isInteger(amount) || amount < 1) throw guardError('INVALID_PRICE');

    const payment = await paymentRepository.create({
      id: generateUUID(),
      business_id: input.businessId,
      session_id: session.id,
      type: input.kind === 'cash_in' ? 'other_income' : 'withdrawal',
      payment_method: 'cash',
      amount,
      reference_type: 'other',
      reference_id: input.originalEntityId ?? null,
      party_id: null,
      payment_date: today,
      notes: note,
      created_by: input.userId,
      device_id: input.deviceId,
      sync_status: 'pending',
    });
    await queueSync(
      'payments',
      payment.id,
      'insert',
      payment as unknown as Record<string, unknown>,
      input.businessId
    );
    await audit({
      businessId: input.businessId,
      userId: input.userId,
      role: input.role,
      action: 'history.correction',
      entity: input.originalEntity ?? 'payment',
      entityId: input.originalEntityId ?? payment.id,
      after: {
        kind: input.kind,
        amount,
        session_id: session.id,
        payment_id: payment.id,
      },
      reason,
      deviceId: input.deviceId,
    });
    return { paymentId: payment.id, kind: input.kind };
  }

  const quantity = input.quantity ?? 0;
  if (!input.productId) throw guardError('PRODUCT_REQUIRED');
  if (!Number.isInteger(quantity) || quantity < 1) throw guardError('INVALID_QUANTITY');

  const stockKind: StockAdjustmentKind =
    input.kind === 'stock_in'
      ? 'adjustment_in'
      : input.kind === 'stock_damage'
        ? 'damaged'
        : 'adjustment_out';

  await adjustStock({
    businessId: input.businessId,
    productId: input.productId,
    userId: input.userId,
    deviceId: input.deviceId,
    role: input.role,
    kind: stockKind,
    quantity,
    reason: note,
  });

  await audit({
    businessId: input.businessId,
    userId: input.userId,
    role: input.role,
    action: 'history.correction',
    entity: input.originalEntity ?? 'stock_movement',
    entityId: input.originalEntityId ?? input.productId,
    after: {
      kind: input.kind,
      product_id: input.productId,
      quantity,
      session_id: session.id,
    },
    reason,
    deviceId: input.deviceId,
  });

  return { kind: input.kind };
}

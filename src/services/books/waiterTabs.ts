import { generateUUID } from '@/utils/uuid';
import { getTodayDateString } from '@/utils/formatters';
import {
  PaymentMethod,
  UserRole,
  WaiterTab,
  WaiterTabItem,
} from '@/types';
import { productRepository } from '@/repositories/products/products';
import { customerRepository } from '@/repositories/sales/customers';
import { saleRepository, saleItemRepository } from '@/repositories/sales/sales';
import { paymentRepository } from '@/repositories/payments/payments';
import { userRepository } from '@/repositories/users/users';
import {
  waiterTabRepository,
  waiterTabItemRepository,
} from '@/repositories/waiters/waiterTabs';
import { queueSync } from '@/services/sync/queue';
import { requireOpenSession } from './session';
import { recordStockMovement } from './recordStockMovement';
import { settleCustomerAccount } from './settle';
import { audit } from './audit';
import { guardError } from './guards';
import { canCloseDay } from '@/utils/permissions';

export type WaiterIssueLine = {
  productId: string;
  quantity: number;
  sellingPrice?: number;
};

async function ensureWaiterCustomer(
  businessId: string,
  waiterUserId: string
): Promise<string> {
  const existing = await customerRepository.findOne(businessId, {
    linked_user_id: waiterUserId,
  });
  if (existing) return existing.id;

  const waiter = await userRepository.findByIdInBusiness(waiterUserId, businessId);
  if (!waiter) throw guardError('WAITER_NOT_FOUND');
  if (waiter.role !== 'STAFF' && waiter.role !== 'CASHIER') {
    throw guardError('WAITER_ROLE_REQUIRED');
  }

  const customer = await customerRepository.create({
    id: generateUUID(),
    business_id: businessId,
    name: waiter.name,
    phone: waiter.phone,
    email: waiter.email,
    address: null,
    credit_limit: 0,
    linked_user_id: waiterUserId,
    active: true,
  });
  await queueSync(
    'customers',
    customer.id,
    'insert',
    customer as unknown as Record<string, unknown>,
    businessId
  );
  return customer.id;
}

async function loadTabBundle(tabId: string, businessId: string) {
  const tab = await waiterTabRepository.findByIdWithMeta(tabId, businessId);
  if (!tab) throw guardError('TAB_NOT_FOUND');
  const items = await waiterTabItemRepository.findByTab(tabId, businessId);
  return { tab, items };
}

async function issueLines(input: {
  businessId: string;
  tabId: string;
  sessionId: string;
  userId: string;
  deviceId: string;
  role: UserRole | null;
  lines: WaiterIssueLine[];
}): Promise<WaiterTabItem[]> {
  const created: WaiterTabItem[] = [];
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw guardError('INVALID_QUANTITY');
    }
    const product = await productRepository.findById(line.productId, input.businessId);
    if (!product?.active) throw guardError('PRODUCT_NOT_FOUND');
    const sellingPrice = line.sellingPrice ?? product.selling_price;
    if (!Number.isInteger(sellingPrice) || sellingPrice < 1) {
      throw guardError('INVALID_PRICE');
    }

    const item = await waiterTabItemRepository.create({
      id: generateUUID(),
      business_id: input.businessId,
      tab_id: input.tabId,
      product_id: line.productId,
      quantity: line.quantity,
      selling_price: sellingPrice,
      unit_cost: product.average_cost ?? 0,
      quantity_outstanding: line.quantity,
    });
    await queueSync(
      'waiter_tab_items',
      item.id,
      'insert',
      item as unknown as Record<string, unknown>,
      input.businessId
    );

    if (product.track_inventory) {
      await recordStockMovement({
        businessId: input.businessId,
        productId: line.productId,
        userId: input.userId,
        deviceId: input.deviceId,
        role: input.role,
        type: 'adjustment_out',
        quantity: line.quantity,
        unitCost: product.average_cost ?? 0,
        referenceType: 'adjustment',
        referenceId: input.tabId,
        sessionId: input.sessionId,
        reason: 'Waiter issue',
      });
    }
    created.push(item);
  }
  return created;
}

/** Manager issues products to a STAFF waiter (stock leaves immediately). */
export async function issueWaiterTab(input: {
  businessId: string;
  waiterUserId: string;
  userId: string;
  deviceId: string;
  role: UserRole | null;
  lines: WaiterIssueLine[];
  notes?: string | null;
}): Promise<WaiterTab> {
  if (!canCloseDay(input.role)) throw guardError('NO_PERMISSION');
  if (!input.lines.length) throw guardError('ITEMS_REQUIRED');

  const session = await requireOpenSession(input.businessId);
  const customerId = await ensureWaiterCustomer(input.businessId, input.waiterUserId);

  const tab = await waiterTabRepository.create({
    id: generateUUID(),
    business_id: input.businessId,
    session_id: session.id,
    waiter_user_id: input.waiterUserId,
    customer_id: customerId,
    sale_id: null,
    status: 'draft',
    paid_amount: 0,
    notes: input.notes?.trim() || null,
    issued_by: input.userId,
    device_id: input.deviceId,
    sync_status: 'pending',
  });
  await queueSync(
    'waiter_tabs',
    tab.id,
    'insert',
    tab as unknown as Record<string, unknown>,
    input.businessId
  );

  await issueLines({
    businessId: input.businessId,
    tabId: tab.id,
    sessionId: session.id,
    userId: input.userId,
    deviceId: input.deviceId,
    role: input.role,
    lines: input.lines,
  });

  await audit({
    businessId: input.businessId,
    userId: input.userId,
    role: input.role,
    action: 'waiter.issue',
    entity: 'waiter_tab',
    entityId: tab.id,
    after: { waiter_user_id: input.waiterUserId, lines: input.lines.length },
    deviceId: input.deviceId,
  });

  return (await waiterTabRepository.findByIdWithMeta(tab.id, input.businessId)) ?? tab;
}

/** Add more items to an open draft tab. */
export async function addItemsToWaiterTab(input: {
  businessId: string;
  tabId: string;
  userId: string;
  deviceId: string;
  role: UserRole | null;
  lines: WaiterIssueLine[];
}): Promise<WaiterTab> {
  if (!canCloseDay(input.role)) throw guardError('NO_PERMISSION');
  if (!input.lines.length) throw guardError('ITEMS_REQUIRED');

  const session = await requireOpenSession(input.businessId);
  const { tab } = await loadTabBundle(input.tabId, input.businessId);
  if (tab.status !== 'draft' && tab.status !== 'partial') {
    throw guardError('TAB_NOT_OPEN');
  }

  const created = await issueLines({
    businessId: input.businessId,
    tabId: tab.id,
    sessionId: session.id,
    userId: input.userId,
    deviceId: input.deviceId,
    role: input.role,
    lines: input.lines,
  });

  // If a credit sale already exists (after first payment), append new lines so
  // the ledger matches stock still out on the tab.
  if (tab.sale_id) {
    let addTotal = 0;
    for (const item of created) {
      const lineTotal = item.quantity_outstanding * item.selling_price;
      addTotal += lineTotal;
      const saleItem = await saleItemRepository.create({
        id: generateUUID(),
        business_id: input.businessId,
        sale_id: tab.sale_id,
        product_id: item.product_id,
        quantity: item.quantity_outstanding,
        selling_price: item.selling_price,
        unit_cost: item.unit_cost,
        discount_amount: 0,
        tax_amount: 0,
        total_amount: lineTotal,
      });
      await queueSync(
        'sale_items',
        saleItem.id,
        'insert',
        saleItem as unknown as Record<string, unknown>,
        input.businessId
      );
    }
    if (addTotal > 0) {
      const sale = await saleRepository.findById(tab.sale_id, input.businessId);
      if (sale) {
        const nextTotal = sale.total_amount + addTotal;
        const nextSub = sale.subtotal + addTotal;
        const updatedSale = await saleRepository.update(tab.sale_id, input.businessId, {
          subtotal: nextSub,
          total_amount: nextTotal,
          payment_status:
            sale.paid_amount >= nextTotal
              ? 'paid'
              : sale.paid_amount > 0
                ? 'partial'
                : 'credit',
          sync_status: 'pending',
        });
        if (updatedSale) {
          await queueSync(
            'sales',
            tab.sale_id,
            'update',
            updatedSale as unknown as Record<string, unknown>,
            input.businessId
          );
        }
        if (tab.customer_id) {
          await settleCustomerAccount(input.businessId, tab.customer_id);
        }
      }
    }
  }

  const updated = await waiterTabRepository.update(tab.id, input.businessId, {
    sync_status: 'pending',
  });
  if (updated) {
    await queueSync(
      'waiter_tabs',
      tab.id,
      'update',
      updated as unknown as Record<string, unknown>,
      input.businessId
    );
  }

  await audit({
    businessId: input.businessId,
    userId: input.userId,
    role: input.role,
    action: 'waiter.add_items',
    entity: 'waiter_tab',
    entityId: tab.id,
    after: { lines: input.lines.length },
    deviceId: input.deviceId,
  });

  return (await waiterTabRepository.findByIdWithMeta(tab.id, input.businessId))!;
}

/** Return outstanding qty from draft (or unpaid debt before settle) — stock comes back. */
export async function returnWaiterTabItems(input: {
  businessId: string;
  tabId: string;
  userId: string;
  deviceId: string;
  role: UserRole | null;
  returns: Array<{ itemId: string; quantity: number }>;
  reason?: string;
}): Promise<WaiterTab> {
  if (!canCloseDay(input.role)) throw guardError('NO_PERMISSION');
  const session = await requireOpenSession(input.businessId);
  const { tab, items } = await loadTabBundle(input.tabId, input.businessId);
  if (tab.status !== 'draft' && tab.status !== 'partial' && tab.status !== 'debt') {
    throw guardError('TAB_NOT_RETURNABLE');
  }

  for (const ret of input.returns) {
    if (!Number.isInteger(ret.quantity) || ret.quantity < 1) {
      throw guardError('INVALID_QUANTITY');
    }
    const item = items.find((i) => i.id === ret.itemId);
    if (!item) throw guardError('ITEM_NOT_FOUND');
    if (ret.quantity > item.quantity_outstanding) throw guardError('RETURN_EXCEEDS');

    const product = await productRepository.findById(item.product_id, input.businessId);
    const nextOutstanding = item.quantity_outstanding - ret.quantity;
    const updatedItem = await waiterTabItemRepository.update(item.id, input.businessId, {
      quantity_outstanding: nextOutstanding,
    });
    if (updatedItem) {
      await queueSync(
        'waiter_tab_items',
        item.id,
        'update',
        updatedItem as unknown as Record<string, unknown>,
        input.businessId
      );
    }

    if (product?.track_inventory) {
      await recordStockMovement({
        businessId: input.businessId,
        productId: item.product_id,
        userId: input.userId,
        deviceId: input.deviceId,
        role: input.role,
        type: 'adjustment_in',
        quantity: ret.quantity,
        unitCost: item.unit_cost,
        referenceType: 'adjustment',
        referenceId: tab.id,
        sessionId: session.id,
        reason: input.reason?.trim() || 'Waiter return',
      });
    }
  }

  const remaining = await waiterTabItemRepository.findByTab(tab.id, input.businessId);
  const stillOut = remaining.reduce((s, i) => s + i.quantity_outstanding, 0);
  if (stillOut === 0 && tab.status === 'draft') {
    const cancelled = await waiterTabRepository.update(tab.id, input.businessId, {
      status: 'cancelled',
      sync_status: 'pending',
    });
    if (cancelled) {
      await queueSync(
        'waiter_tabs',
        tab.id,
        'update',
        cancelled as unknown as Record<string, unknown>,
        input.businessId
      );
    }
  }

  await audit({
    businessId: input.businessId,
    userId: input.userId,
    role: input.role,
    action: 'waiter.return',
    entity: 'waiter_tab',
    entityId: tab.id,
    after: { returns: input.returns },
    reason: input.reason,
    deviceId: input.deviceId,
  });

  return (await waiterTabRepository.findByIdWithMeta(tab.id, input.businessId))!;
}

/**
 * Create a sale from outstanding tab lines without moving stock again
 * (stock already left on issue).
 */
async function createSaleFromTab(input: {
  businessId: string;
  tab: WaiterTab;
  items: WaiterTabItem[];
  userId: string;
  deviceId: string;
  sessionId: string;
  paymentMethod: PaymentMethod;
  paid: boolean;
}): Promise<string> {
  const outstanding = input.items.filter((i) => i.quantity_outstanding > 0);
  if (outstanding.length === 0) throw guardError('TAB_EMPTY');

  const today = getTodayDateString();
  let subtotal = 0;
  for (const item of outstanding) {
    subtotal += item.quantity_outstanding * item.selling_price;
  }

  const saleId = generateUUID();
  const sale = await saleRepository.create({
    id: saleId,
    business_id: input.businessId,
    customer_id: input.tab.customer_id,
    session_id: input.sessionId,
    reference_number: `WAIT-${Date.now().toString(36).toUpperCase()}`,
    subtotal,
    discount_amount: 0,
    tax_amount: 0,
    total_amount: subtotal,
    paid_amount: input.paid ? subtotal : 0,
    voided: false,
    payment_status: input.paid ? 'paid' : 'credit',
    sale_date: today,
    notes: `Waiter tab ${input.tab.id.slice(0, 8)}`,
    created_by: input.userId,
    device_id: input.deviceId,
    sync_status: 'pending',
  });
  await queueSync(
    'sales',
    sale.id,
    'insert',
    sale as unknown as Record<string, unknown>,
    input.businessId
  );

  for (const item of outstanding) {
    const lineTotal = item.quantity_outstanding * item.selling_price;
    const saleItem = await saleItemRepository.create({
      id: generateUUID(),
      business_id: input.businessId,
      sale_id: saleId,
      product_id: item.product_id,
      quantity: item.quantity_outstanding,
      selling_price: item.selling_price,
      unit_cost: item.unit_cost,
      discount_amount: 0,
      tax_amount: 0,
      total_amount: lineTotal,
    });
    await queueSync(
      'sale_items',
      saleItem.id,
      'insert',
      saleItem as unknown as Record<string, unknown>,
      input.businessId
    );
  }

  if (input.paid && input.paymentMethod !== 'credit') {
    const payment = await paymentRepository.create({
      id: generateUUID(),
      business_id: input.businessId,
      session_id: input.sessionId,
      type: 'sale_payment',
      payment_method: input.paymentMethod,
      amount: subtotal,
      reference_type: 'sale',
      reference_id: saleId,
      party_id: input.tab.customer_id,
      payment_date: today,
      notes: 'Waiter tab settle',
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
  }

  return saleId;
}

function tabDue(items: WaiterTabItem[], paidAmount: number): number {
  const total = items.reduce((s, i) => s + i.quantity_outstanding * i.selling_price, 0);
  return Math.max(0, total - Math.max(0, paidAmount));
}

/**
 * Manual payment (full or partial) against a draft / partial / debt tab.
 * Enter any amount ≤ balance due. First payment on a draft creates the credit sale
 * (stock already out); later payments use customer_payment + settle.
 */
export async function recordWaiterPayment(input: {
  businessId: string;
  tabId: string;
  userId: string;
  deviceId: string;
  role: UserRole | null;
  amount: number;
  paymentMethod: 'cash' | 'mobile_money' | 'bank';
}): Promise<WaiterTab> {
  if (!canCloseDay(input.role)) throw guardError('NO_PERMISSION');
  if (!Number.isInteger(input.amount) || input.amount < 1) throw guardError('INVALID_PRICE');

  const session = await requireOpenSession(input.businessId);
  const { tab, items } = await loadTabBundle(input.tabId, input.businessId);
  if (tab.status !== 'draft' && tab.status !== 'partial' && tab.status !== 'debt') {
    throw guardError('TAB_NOT_PAYABLE');
  }

  const due = tabDue(items, tab.paid_amount ?? 0);
  if (due <= 0) throw guardError('TAB_EMPTY');
  if (input.amount > due) {
    throw guardError('OVERPAYMENT', { excess: input.amount - due, outstanding: due });
  }

  if (!tab.customer_id) {
    const customerId = await ensureWaiterCustomer(input.businessId, tab.waiter_user_id);
    await waiterTabRepository.update(tab.id, input.businessId, { customer_id: customerId });
    tab.customer_id = customerId;
  }

  let saleId = tab.sale_id;
  if (!saleId) {
    saleId = await createSaleFromTab({
      businessId: input.businessId,
      tab,
      items,
      userId: input.userId,
      deviceId: input.deviceId,
      sessionId: session.id,
      paymentMethod: 'credit',
      paid: false,
    });
  }

  const today = getTodayDateString();
  const payment = await paymentRepository.create({
    id: generateUUID(),
    business_id: input.businessId,
    session_id: session.id,
    type: 'customer_payment',
    payment_method: input.paymentMethod,
    amount: input.amount,
    reference_type: 'customer',
    reference_id: tab.customer_id,
    party_id: tab.customer_id,
    payment_date: today,
    notes: `Waiter tab ${tab.id.slice(0, 8)}`,
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

  await settleCustomerAccount(input.businessId, tab.customer_id);

  const newPaid = (tab.paid_amount ?? 0) + input.amount;
  const remaining = tabDue(items, newPaid);
  const sale = await saleRepository.findById(saleId, input.businessId);
  const fullyPaid = remaining <= 0 || sale?.payment_status === 'paid';

  let nextStatus: WaiterTab['status'] = tab.status;
  if (fullyPaid) nextStatus = 'paid';
  else if (tab.status === 'debt') nextStatus = 'debt';
  else nextStatus = 'partial';

  const updated = await waiterTabRepository.update(tab.id, input.businessId, {
    sale_id: saleId,
    paid_amount: newPaid,
    status: nextStatus,
    sync_status: 'pending',
  });
  if (updated) {
    await queueSync(
      'waiter_tabs',
      tab.id,
      'update',
      updated as unknown as Record<string, unknown>,
      input.businessId
    );
  }

  await audit({
    businessId: input.businessId,
    userId: input.userId,
    role: input.role,
    action: 'waiter.payment',
    entity: 'waiter_tab',
    entityId: tab.id,
    after: {
      amount: input.amount,
      paid_amount: newPaid,
      status: nextStatus,
      payment_method: input.paymentMethod,
      sale_id: saleId,
    },
    deviceId: input.deviceId,
  });

  return (await waiterTabRepository.findByIdWithMeta(tab.id, input.businessId))!;
}

/** Full settle shortcut — records the full remaining balance. */
export async function settleWaiterTabPaid(input: {
  businessId: string;
  tabId: string;
  userId: string;
  deviceId: string;
  role: UserRole | null;
  paymentMethod: 'cash' | 'mobile_money' | 'bank';
}): Promise<WaiterTab> {
  const { items } = await loadTabBundle(input.tabId, input.businessId);
  const tab = await waiterTabRepository.findById(input.tabId, input.businessId);
  if (!tab) throw guardError('TAB_NOT_FOUND');
  const amount = tabDue(items, tab.paid_amount ?? 0);
  if (amount < 1) throw guardError('TAB_EMPTY');
  return recordWaiterPayment({ ...input, amount });
}

/** @deprecated use recordWaiterPayment */
export async function payWaiterDebt(input: {
  businessId: string;
  tabId: string;
  userId: string;
  deviceId: string;
  role: UserRole | null;
  amount: number;
  paymentMethod: 'cash' | 'mobile_money' | 'bank';
}): Promise<WaiterTab> {
  return recordWaiterPayment(input);
}

/**
 * On session close: unpaid draft/partial tabs → credit sales + debt (Option 1).
 */
export async function convertOpenWaiterDraftsToDebt(input: {
  businessId: string;
  sessionId: string;
  userId: string;
  deviceId: string;
  role: UserRole | null;
}): Promise<number> {
  const openTabs = await waiterTabRepository.findOpenForSession(
    input.businessId,
    input.sessionId
  );
  let converted = 0;
  for (const tab of openTabs) {
    const items = await waiterTabItemRepository.findByTab(tab.id, input.businessId);
    const outstanding = items.filter((i) => i.quantity_outstanding > 0);
    if (outstanding.length === 0) {
      await waiterTabRepository.update(tab.id, input.businessId, {
        status: 'cancelled',
        sync_status: 'pending',
      });
      continue;
    }

    if (!tab.customer_id) {
      const customerId = await ensureWaiterCustomer(input.businessId, tab.waiter_user_id);
      await waiterTabRepository.update(tab.id, input.businessId, { customer_id: customerId });
      tab.customer_id = customerId;
    }

    let saleId = tab.sale_id;
    if (!saleId) {
      saleId = await createSaleFromTab({
        businessId: input.businessId,
        tab,
        items: outstanding,
        userId: input.userId,
        deviceId: input.deviceId,
        sessionId: input.sessionId,
        paymentMethod: 'credit',
        paid: false,
      });
      // Apply any payments already recorded on the tab before close.
      if ((tab.paid_amount ?? 0) > 0) {
        await settleCustomerAccount(input.businessId, tab.customer_id);
      }
    }

    const sale = await saleRepository.findById(saleId, input.businessId);
    if (sale?.payment_status === 'paid') {
      await waiterTabRepository.update(tab.id, input.businessId, {
        status: 'paid',
        sale_id: saleId,
        sync_status: 'pending',
      });
      continue;
    }

    const updated = await waiterTabRepository.update(tab.id, input.businessId, {
      status: 'debt',
      sale_id: saleId,
      sync_status: 'pending',
    });
    if (updated) {
      await queueSync(
        'waiter_tabs',
        tab.id,
        'update',
        updated as unknown as Record<string, unknown>,
        input.businessId
      );
    }
    converted++;
  }

  if (converted > 0) {
    await audit({
      businessId: input.businessId,
      userId: input.userId,
      role: input.role,
      action: 'waiter.close_to_debt',
      entity: 'daily_closing',
      entityId: input.sessionId,
      after: { converted },
      deviceId: input.deviceId,
    });
  }
  return converted;
}

/** Return stock from a paid tab (same session or open session) and void/adjust the sale. */
export async function returnPaidWaiterTab(input: {
  businessId: string;
  tabId: string;
  userId: string;
  deviceId: string;
  role: UserRole | null;
  reason: string;
}): Promise<WaiterTab> {
  if (!canCloseDay(input.role)) throw guardError('NO_PERMISSION');
  if (!input.reason.trim()) throw guardError('REASON_REQUIRED');

  const session = await requireOpenSession(input.businessId);
  const { tab, items } = await loadTabBundle(input.tabId, input.businessId);
  if (tab.status !== 'paid' && tab.status !== 'debt') {
    throw guardError('TAB_NOT_RETURNABLE');
  }

  for (const item of items) {
    if (item.quantity_outstanding < 1) continue;
    const product = await productRepository.findById(item.product_id, input.businessId);
    if (product?.track_inventory) {
      await recordStockMovement({
        businessId: input.businessId,
        productId: item.product_id,
        userId: input.userId,
        deviceId: input.deviceId,
        role: input.role,
        type: 'return_in',
        quantity: item.quantity_outstanding,
        unitCost: item.unit_cost,
        referenceType: 'sale_return',
        referenceId: tab.sale_id,
        sessionId: session.id,
        reason: input.reason.trim(),
      });
    }
    await waiterTabItemRepository.update(item.id, input.businessId, {
      quantity_outstanding: 0,
    });
  }

  if (tab.sale_id) {
    const sale = await saleRepository.findById(tab.sale_id, input.businessId);
    if (sale && !sale.voided) {
      const voided = await saleRepository.update(tab.sale_id, input.businessId, {
        voided: true,
        sync_status: 'pending',
      });
      if (voided) {
        await queueSync(
          'sales',
          tab.sale_id,
          'update',
          voided as unknown as Record<string, unknown>,
          input.businessId
        );
      }
    }
    if (tab.customer_id) {
      await settleCustomerAccount(input.businessId, tab.customer_id);
    }
  }

  const updated = await waiterTabRepository.update(tab.id, input.businessId, {
    status: 'cancelled',
    sync_status: 'pending',
  });
  if (updated) {
    await queueSync(
      'waiter_tabs',
      tab.id,
      'update',
      updated as unknown as Record<string, unknown>,
      input.businessId
    );
  }

  await audit({
    businessId: input.businessId,
    userId: input.userId,
    role: input.role,
    action: 'waiter.return_paid',
    entity: 'waiter_tab',
    entityId: tab.id,
    reason: input.reason,
    deviceId: input.deviceId,
  });

  return (await waiterTabRepository.findByIdWithMeta(tab.id, input.businessId))!;
}

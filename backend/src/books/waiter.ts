import { allocateItemPayment, rebalanceItemPayments, type AllocItem } from '../shared/waiterAllocation';
import { audit, BooksError, businessToday, Ctx, newId, num, one, reference, rows, WEB_DEVICE } from './core';
import { getOpenSession, requireOpenSession } from './session';
import { settleCustomer } from './settle';
import { recordMovement } from './stock';

type Tab = {
  id: string;
  session_id: string;
  waiter_user_id: string;
  customer_id: string | null;
  client_label: string | null;
  sale_id: string | null;
  status: string;
  paid_amount: number;
};
type Item = {
  id: string;
  product_id: string;
  quantity: number;
  selling_price: number;
  unit_cost: number;
  quantity_outstanding: number;
  paid_amount: number;
  created_at: string;
};

const manager = (ctx: Ctx) => ctx.role === 'OWNER' || ctx.role === 'MANAGER';

async function loadTab(ctx: Ctx, tabId: string): Promise<{ tab: Tab; items: Item[] }> {
  const tab = await one<Record<string, unknown>>(ctx, `SELECT * FROM waiter_tabs WHERE business_id=$1 AND id=$2`, [ctx.businessId, tabId]);
  if (!tab) throw new BooksError('NOT_FOUND', 404);
  const items = await rows<Record<string, unknown>>(ctx, `SELECT * FROM waiter_tab_items WHERE business_id=$1 AND tab_id=$2 ORDER BY created_at ASC`, [ctx.businessId, tabId]);
  return {
    tab: { ...(tab as unknown as Tab), paid_amount: num(tab.paid_amount) },
    items: items.map((i) => ({
      id: String(i.id), product_id: String(i.product_id), quantity: num(i.quantity), selling_price: num(i.selling_price),
      unit_cost: num(i.unit_cost), quantity_outstanding: num(i.quantity_outstanding), paid_amount: num(i.paid_amount),
      created_at: new Date(i.created_at as string).toISOString(),
    })),
  };
}

const allocOf = (items: Item[]): AllocItem[] =>
  items.map((i) => ({ id: i.id, value: i.quantity_outstanding * i.selling_price, paid: i.paid_amount, issuedAt: i.created_at }));

async function persistLinePaid(ctx: Ctx, items: Item[], next: Record<string, number>) {
  for (const item of items) {
    const paid = next[item.id] ?? 0;
    if (paid !== item.paid_amount) {
      await ctx.tx.query(`UPDATE waiter_tab_items SET paid_amount=$3, updated_at=now() WHERE business_id=$1 AND id=$2`, [ctx.businessId, item.id, paid]);
    }
  }
}

async function rebalance(ctx: Ctx, tabId: string) {
  const { tab, items } = await loadTab(ctx, tabId);
  await persistLinePaid(ctx, items, rebalanceItemPayments(allocOf(items), tab.paid_amount));
}

const tabDue = (items: Item[], paid: number) => Math.max(0, items.reduce((s, i) => s + i.quantity_outstanding * i.selling_price, 0) - Math.max(0, paid));

/** Each waiter owes through a linked customer account, created on first use (same as the phone). */
async function ensureWaiterCustomer(ctx: Ctx, waiterId: string): Promise<string> {
  const existing = await one<{ id: string }>(ctx, `SELECT id FROM customers WHERE business_id=$1 AND linked_user_id=$2 LIMIT 1`, [ctx.businessId, waiterId]);
  if (existing) return existing.id;
  const waiter = await one<{ name: string; phone: string | null; email: string | null; role: string }>(
    ctx, `SELECT name, phone, email, role FROM users WHERE id=$1 AND business_id=$2`, [waiterId, ctx.businessId],
  );
  if (!waiter) throw new BooksError('NOT_FOUND', 404);
  if (waiter.role !== 'STAFF' && waiter.role !== 'CASHIER') throw new BooksError('WAITER_ROLE_REQUIRED');
  const id = newId();
  await ctx.tx.query(
    `INSERT INTO customers (id, business_id, name, phone, email, address, credit_limit, linked_user_id, active, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,NULL,0,$6,true,now(),now())`,
    [id, ctx.businessId, waiter.name, waiter.phone, waiter.email, waiterId],
  );
  return id;
}

async function issueLines(ctx: Ctx, tabId: string, sessionId: string, lines: { productId: string; quantity: number; sellingPrice?: number }[]) {
  const created: Item[] = [];
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new BooksError('INVALID_QUANTITY');
    const product = await one<{ selling_price: string; average_cost: string; track_inventory: boolean; active: boolean }>(
      ctx, `SELECT selling_price, average_cost, track_inventory, active FROM products WHERE business_id=$1 AND id=$2`, [ctx.businessId, line.productId],
    );
    if (!product?.active) throw new BooksError('PRODUCT_NOT_FOUND', 404);
    const price = line.sellingPrice ?? num(product.selling_price);
    if (!Number.isInteger(price) || price < 1) throw new BooksError('INVALID_PRICE');
    const id = newId();
    await ctx.tx.query(
      `INSERT INTO waiter_tab_items (id, business_id, tab_id, product_id, quantity, selling_price, unit_cost, quantity_outstanding, paid_amount, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$5,0,now(),now())`,
      [id, ctx.businessId, tabId, line.productId, line.quantity, price, num(product.average_cost)],
    );
    if (product.track_inventory) {
      await recordMovement(ctx, {
        productId: line.productId, type: 'adjustment_out', quantity: line.quantity, unitCost: num(product.average_cost),
        sessionId, referenceType: 'adjustment', referenceId: tabId, reason: 'Waiter issue',
      });
    }
    created.push({ id, product_id: line.productId, quantity: line.quantity, selling_price: price, unit_cost: num(product.average_cost), quantity_outstanding: line.quantity, paid_amount: 0, created_at: new Date().toISOString() });
  }
  return created;
}

/** Stock leaves at once. Issuing again to the same waiter (and client) in the open day joins their open tab. */
export async function issueTab(ctx: Ctx, input: { waiterId: string; clientLabel?: string | null; notes?: string | null; lines: { productId: string; quantity: number; sellingPrice?: number }[] }) {
  if (!manager(ctx)) throw new BooksError('FORBIDDEN', 403);
  if (!input.lines.length) throw new BooksError('ITEMS_REQUIRED');
  const session = await requireOpenSession(ctx);
  const label = input.clientLabel?.trim().slice(0, 60) || null;
  const open = await rows<{ id: string; client_label: string | null }>(
    ctx,
    `SELECT id, client_label FROM waiter_tabs WHERE business_id=$1 AND session_id=$2 AND waiter_user_id=$3 AND status IN ('draft','partial') ORDER BY created_at DESC`,
    [ctx.businessId, session.id, input.waiterId],
  );
  const same = (a: string | null) => (a ?? '').trim().toLowerCase() === (label ?? '').toLowerCase();
  const existing = label ? open.find((t) => same(t.client_label)) : open[0];
  if (existing) {
    await addItems(ctx, existing.id, input.lines);
    return { id: existing.id, joinedExisting: true };
  }
  const customerId = await ensureWaiterCustomer(ctx, input.waiterId);
  const id = newId();
  await ctx.tx.query(
    `INSERT INTO waiter_tabs (id, business_id, session_id, waiter_user_id, customer_id, client_label, sale_id, status, paid_amount, notes, issued_by, device_id, sync_status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,NULL,'draft',0,$7,$8,$9,'synced',now(),now())`,
    [id, ctx.businessId, session.id, input.waiterId, customerId, label, input.notes?.trim() || null, ctx.userId, WEB_DEVICE],
  );
  await issueLines(ctx, id, session.id, input.lines);
  await audit(ctx, { action: 'waiter.issue', entity: 'waiter_tab', entityId: id, after: { waiter_user_id: input.waiterId, client_label: label, lines: input.lines.length } });
  return { id, joinedExisting: false };
}

export async function addItems(ctx: Ctx, tabId: string, lines: { productId: string; quantity: number; sellingPrice?: number }[]) {
  if (!manager(ctx)) throw new BooksError('FORBIDDEN', 403);
  if (!lines.length) throw new BooksError('ITEMS_REQUIRED');
  const session = await requireOpenSession(ctx);
  const { tab } = await loadTab(ctx, tabId);
  if (tab.status !== 'draft' && tab.status !== 'partial') throw new BooksError('TAB_NOT_OPEN');
  const created = await issueLines(ctx, tabId, session.id, lines);
  if (tab.sale_id) {
    let add = 0;
    for (const item of created) {
      const total = item.quantity * item.selling_price;
      add += total;
      await ctx.tx.query(
        `INSERT INTO sale_items (id, business_id, sale_id, product_id, quantity, selling_price, unit_cost, discount_amount, tax_amount, total_amount, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,$8,now(),now())`,
        [newId(), ctx.businessId, tab.sale_id, item.product_id, item.quantity, item.selling_price, item.unit_cost, total],
      );
    }
    await ctx.tx.query(
      `UPDATE sales SET subtotal=subtotal+$3, total_amount=total_amount+$3,
         payment_status = CASE WHEN paid_amount >= total_amount+$3 THEN 'paid' WHEN paid_amount > 0 THEN 'partial' ELSE 'credit' END, updated_at=now()
       WHERE business_id=$1 AND id=$2`,
      [ctx.businessId, tab.sale_id, add],
    );
    await settleCustomer(ctx, tab.customer_id);
  }
  await ctx.tx.query(`UPDATE waiter_tabs SET updated_at=now() WHERE business_id=$1 AND id=$2`, [ctx.businessId, tabId]);
  await audit(ctx, { action: 'waiter.add_items', entity: 'waiter_tab', entityId: tabId, after: { lines: lines.length } });
}

async function createSaleFromTab(ctx: Ctx, tab: Tab, items: Item[], sessionId: string): Promise<string> {
  const outstanding = items.filter((i) => i.quantity_outstanding > 0);
  if (outstanding.length === 0) throw new BooksError('TAB_EMPTY');
  const subtotal = outstanding.reduce((s, i) => s + i.quantity_outstanding * i.selling_price, 0);
  const saleId = newId();
  const notes = tab.client_label ? `Waiter tab ${tab.id.slice(0, 8)} · ${tab.client_label}` : `Waiter tab ${tab.id.slice(0, 8)}`;
  await ctx.tx.query(
    `INSERT INTO sales (id, business_id, customer_id, session_id, reference_number, subtotal, discount_amount, tax_amount, total_amount, paid_amount, voided,
       payment_status, sale_date, notes, created_by, device_id, sync_status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,0,0,$6,0,false,'credit',$7,$8,$9,$10,'synced',now(),now())`,
    [saleId, ctx.businessId, tab.customer_id, sessionId, reference('WAIT'), subtotal, businessToday(ctx.timezone), notes, ctx.userId, WEB_DEVICE],
  );
  for (const item of outstanding) {
    await ctx.tx.query(
      `INSERT INTO sale_items (id, business_id, sale_id, product_id, quantity, selling_price, unit_cost, discount_amount, tax_amount, total_amount, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,0,0,$8,now(),now())`,
      [newId(), ctx.businessId, saleId, item.product_id, item.quantity_outstanding, item.selling_price, item.unit_cost, item.quantity_outstanding * item.selling_price],
    );
  }
  return saleId;
}

/** Payment against a tab; ticked lines are marked paid first, the rest oldest first. Books use the tab total. */
export async function recordTabPayment(ctx: Ctx, tabId: string, input: { amount: number; method: 'cash' | 'mobile_money' | 'bank'; notes?: string | null; itemIds?: string[] }) {
  if (!manager(ctx)) throw new BooksError('FORBIDDEN', 403);
  if (!Number.isInteger(input.amount) || input.amount < 1) throw new BooksError('INVALID_PRICE');
  const open = await getOpenSession(ctx);
  const { tab, items } = await loadTab(ctx, tabId);
  if (!['draft', 'partial', 'debt'].includes(tab.status)) throw new BooksError('TAB_NOT_PAYABLE');
  const due = tabDue(items, tab.paid_amount);
  if (due <= 0) throw new BooksError('TAB_EMPTY');
  if (input.amount > due) throw new BooksError('OVERPAYMENT', 400, { outstanding: due });
  const customerId = tab.customer_id ?? (await ensureWaiterCustomer(ctx, tab.waiter_user_id));
  let saleId = tab.sale_id;
  if (!saleId) {
    if (!open) throw new BooksError('DAY_CLOSED');
    saleId = await createSaleFromTab(ctx, { ...tab, customer_id: customerId }, items, open.id);
  }
  await ctx.tx.query(
    `INSERT INTO payments (id, business_id, session_id, type, payment_method, amount, reference_type, reference_id, party_id, payment_date, notes, created_by, device_id, sync_status, created_at, updated_at)
     VALUES ($1,$2,$3,'customer_payment',$4,$5,'customer',$6,$6,$7,$8,$9,$10,'synced',now(),now())`,
    [newId(), ctx.businessId, open?.id ?? null, input.method, input.amount, customerId, businessToday(ctx.timezone),
      input.notes?.trim() ? `Waiter tab ${tab.id.slice(0, 8)} · ${input.notes.trim()}` : `Waiter tab ${tab.id.slice(0, 8)}`, ctx.userId, WEB_DEVICE],
  );
  await settleCustomer(ctx, customerId);
  const newPaid = tab.paid_amount + input.amount;
  const sale = await one<{ payment_status: string }>(ctx, `SELECT payment_status FROM sales WHERE id=$1`, [saleId]);
  const fully = tabDue(items, newPaid) <= 0 || sale?.payment_status === 'paid';
  const status = fully ? 'paid' : tab.status === 'debt' ? 'debt' : 'partial';
  const settled = rebalanceItemPayments(allocOf(items), tab.paid_amount);
  await persistLinePaid(ctx, items, allocateItemPayment(allocOf(items).map((i) => ({ ...i, paid: settled[i.id] ?? 0 })), input.amount, input.itemIds ?? []));
  await ctx.tx.query(
    `UPDATE waiter_tabs SET sale_id=$3, customer_id=$4, paid_amount=$5, status=$6, updated_at=now() WHERE business_id=$1 AND id=$2`,
    [ctx.businessId, tabId, saleId, customerId, newPaid, status],
  );
  await audit(ctx, { action: 'waiter.payment', entity: 'waiter_tab', entityId: tabId, after: { amount: input.amount, paid_amount: newPaid, status, payment_method: input.method } });
  return { status, paid: newPaid };
}

/** Returned items always come back into stock; a linked credit sale shrinks to match. */
export async function returnTabItems(ctx: Ctx, tabId: string, returns: { itemId: string; quantity: number }[], reason?: string | null) {
  if (!manager(ctx)) throw new BooksError('FORBIDDEN', 403);
  if (!returns.length) throw new BooksError('ITEMS_REQUIRED');
  const session = await requireOpenSession(ctx);
  const { tab, items } = await loadTab(ctx, tabId);
  if (!['draft', 'partial', 'debt', 'paid'].includes(tab.status)) throw new BooksError('TAB_NOT_RETURNABLE');
  for (const ret of returns) {
    const item = items.find((i) => i.id === ret.itemId);
    if (!item) throw new BooksError('NOT_FOUND', 404);
    if (!Number.isInteger(ret.quantity) || ret.quantity < 1 || ret.quantity > item.quantity_outstanding) throw new BooksError('INVALID_QUANTITY');
    await ctx.tx.query(`UPDATE waiter_tab_items SET quantity_outstanding=quantity_outstanding-$3, updated_at=now() WHERE business_id=$1 AND id=$2`, [ctx.businessId, item.id, ret.quantity]);
    const product = await one<{ track_inventory: boolean }>(ctx, `SELECT track_inventory FROM products WHERE id=$1`, [item.product_id]);
    if (product?.track_inventory) {
      await recordMovement(ctx, {
        productId: item.product_id, type: tab.sale_id ? 'return_in' : 'adjustment_in', quantity: ret.quantity, unitCost: item.unit_cost,
        sessionId: session.id, referenceType: tab.sale_id ? 'sale_return' : 'adjustment', referenceId: tab.sale_id ?? tab.id, reason: reason?.trim() || 'Waiter return',
      });
    }
    if (tab.sale_id) {
      const line = await one<{ id: string; quantity: string; selling_price: string }>(
        ctx, `SELECT id, quantity, selling_price FROM sale_items WHERE business_id=$1 AND sale_id=$2 AND product_id=$3 ORDER BY created_at LIMIT 1`, [ctx.businessId, tab.sale_id, item.product_id],
      );
      if (line) {
        const nextQty = Math.max(0, num(line.quantity) - ret.quantity);
        await ctx.tx.query(`UPDATE sale_items SET quantity=$3, total_amount=$4, updated_at=now() WHERE business_id=$1 AND id=$2`, [ctx.businessId, line.id, nextQty, nextQty * num(line.selling_price)]);
      }
      const delta = ret.quantity * item.selling_price;
      await ctx.tx.query(
        `UPDATE sales SET subtotal=GREATEST(subtotal-$3,0), total_amount=GREATEST(total_amount-$3,0),
           payment_status = CASE WHEN paid_amount >= GREATEST(total_amount-$3,0) AND GREATEST(total_amount-$3,0) > 0 THEN 'paid' WHEN paid_amount > 0 THEN 'partial' ELSE 'credit' END, updated_at=now()
         WHERE business_id=$1 AND id=$2`,
        [ctx.businessId, tab.sale_id, delta],
      );
    }
  }
  const after = await loadTab(ctx, tabId);
  const stillOut = after.items.reduce((s, i) => s + i.quantity_outstanding, 0);
  const total = after.items.reduce((s, i) => s + i.quantity_outstanding * i.selling_price, 0);
  let status = tab.status;
  if (stillOut === 0) {
    status = 'cancelled';
    if (tab.sale_id) await ctx.tx.query(`UPDATE sales SET voided=true, updated_at=now() WHERE business_id=$1 AND id=$2 AND voided=false`, [ctx.businessId, tab.sale_id]);
  } else if (['paid', 'partial', 'debt'].includes(tab.status)) {
    const paid = tab.paid_amount;
    status = paid <= 0 ? (tab.status === 'debt' ? 'debt' : 'draft') : paid >= total ? 'paid' : tab.status === 'debt' ? 'debt' : 'partial';
  }
  await ctx.tx.query(`UPDATE waiter_tabs SET status=$3, updated_at=now() WHERE business_id=$1 AND id=$2`, [ctx.businessId, tabId, status]);
  if (tab.sale_id) await settleCustomer(ctx, tab.customer_id);
  await rebalance(ctx, tabId);
  await audit(ctx, { action: 'waiter.return', entity: 'waiter_tab', entityId: tabId, after: { returns, status }, reason: reason ?? null });
}

/** At close of day, unpaid or part-paid tabs become credit sales owed by the waiter. */
export async function convertOpenTabsToDebt(ctx: Ctx, sessionId: string): Promise<number> {
  const open = await rows<{ id: string }>(ctx, `SELECT id FROM waiter_tabs WHERE business_id=$1 AND session_id=$2 AND status IN ('draft','partial') ORDER BY created_at`, [ctx.businessId, sessionId]);
  let converted = 0;
  for (const { id } of open) {
    const { tab, items } = await loadTab(ctx, id);
    if (!items.some((i) => i.quantity_outstanding > 0)) {
      await ctx.tx.query(`UPDATE waiter_tabs SET status='cancelled', updated_at=now() WHERE id=$1`, [id]);
      continue;
    }
    const customerId = tab.customer_id ?? (await ensureWaiterCustomer(ctx, tab.waiter_user_id));
    let saleId = tab.sale_id;
    if (!saleId) {
      saleId = await createSaleFromTab(ctx, { ...tab, customer_id: customerId }, items, sessionId);
      await settleCustomer(ctx, customerId);
    }
    const sale = await one<{ payment_status: string }>(ctx, `SELECT payment_status FROM sales WHERE id=$1`, [saleId]);
    const status = sale?.payment_status === 'paid' ? 'paid' : 'debt';
    await ctx.tx.query(`UPDATE waiter_tabs SET status=$2, sale_id=$3, customer_id=$4, updated_at=now() WHERE id=$1`, [id, status, saleId, customerId]);
    if (status === 'debt') converted += 1;
  }
  if (converted > 0) await audit(ctx, { action: 'waiter.close_to_debt', entity: 'daily_closing', entityId: sessionId, after: { converted } });
  return converted;
}

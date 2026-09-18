import { Router } from 'express';
import { EntityTarget, ObjectLiteral } from 'typeorm';
import { AppDataSource } from '../data-source';
import {
  Business,
  User,
  Category,
  Product,
  Supplier,
  Customer,
  StockMovement,
  Purchase,
  PurchaseItem,
  Sale,
  SaleItem,
  Expense,
  Payment,
  DailyClosing,
} from '../entities';
import { AuthedRequest, requireAuth } from '../middleware/auth';

export const syncRouter = Router();

const ENTITY_BY_TABLE: Record<string, EntityTarget<ObjectLiteral>> = {
  businesses: Business,
  users: User,
  categories: Category,
  products: Product,
  suppliers: Supplier,
  customers: Customer,
  stock_movements: StockMovement,
  purchases: Purchase,
  purchase_items: PurchaseItem,
  sales: Sale,
  sale_items: SaleItem,
  expenses: Expense,
  payments: Payment,
  daily_closings: DailyClosing,
};

const TABLE_COLUMNS: Record<string, string[]> = {
  businesses: ['id', 'name', 'business_code', 'currency', 'country', 'timezone', 'created_at', 'updated_at'],
  users: [
    'id', 'business_id', 'name', 'email', 'phone', 'password_hash', 'role', 'active',
    'created_at', 'updated_at',
  ],
  categories: ['id', 'business_id', 'name', 'description', 'active', 'created_at', 'updated_at'],
  products: [
    'id', 'business_id', 'category_id', 'name', 'sku', 'barcode', 'unit', 'selling_price',
    'average_cost', 'reorder_level', 'track_inventory', 'active', 'created_at', 'updated_at',
  ],
  suppliers: ['id', 'business_id', 'name', 'phone', 'email', 'address', 'active', 'created_at', 'updated_at'],
  customers: [
    'id', 'business_id', 'name', 'phone', 'email', 'address', 'credit_limit', 'active',
    'created_at', 'updated_at',
  ],
  stock_movements: [
    'id', 'business_id', 'product_id', 'type', 'quantity', 'unit_cost', 'reference_type',
    'reference_id', 'occurred_at', 'created_by', 'device_id', 'sync_status', 'created_at', 'updated_at',
  ],
  purchases: [
    'id', 'business_id', 'supplier_id', 'reference_number', 'total_amount', 'paid_amount', 'status',
    'purchase_date', 'notes', 'created_by', 'device_id', 'sync_status', 'created_at', 'updated_at',
  ],
  purchase_items: [
    'id', 'business_id', 'purchase_id', 'product_id', 'quantity', 'unit_cost', 'total_cost',
    'created_at', 'updated_at',
  ],
  sales: [
    'id', 'business_id', 'customer_id', 'reference_number', 'subtotal', 'discount_amount', 'tax_amount',
    'total_amount', 'payment_status', 'sale_date', 'notes', 'created_by', 'device_id', 'sync_status',
    'created_at', 'updated_at',
  ],
  sale_items: [
    'id', 'business_id', 'sale_id', 'product_id', 'quantity', 'selling_price', 'unit_cost',
    'discount_amount', 'tax_amount', 'total_amount', 'created_at', 'updated_at',
  ],
  expenses: [
    'id', 'business_id', 'category', 'amount', 'payment_method', 'description', 'expense_date',
    'reference_number', 'created_by', 'device_id', 'sync_status', 'created_at', 'updated_at',
  ],
  payments: [
    'id', 'business_id', 'type', 'payment_method', 'amount', 'reference_type', 'reference_id',
    'party_id', 'payment_date', 'notes', 'created_by', 'device_id', 'sync_status', 'created_at', 'updated_at',
  ],
  daily_closings: [
    'id', 'business_id', 'business_date', 'opening_cash', 'cash_sales', 'customer_cash_payments',
    'other_cash_income', 'cash_purchases', 'cash_expenses', 'supplier_cash_payments', 'withdrawals',
    'expected_cash', 'actual_cash', 'cash_variance', 'total_sales', 'cogs', 'gross_profit', 'expenses',
    'net_profit', 'opening_stock_qty', 'opening_stock_value', 'closing_stock_qty', 'closing_stock_value',
    'notes', 'closed_by', 'closed_at', 'status', 'created_at', 'updated_at',
  ],
};

const BOOL_KEYS = new Set(['active', 'track_inventory']);

type Actor = {
  id: string;
  business_id: string | null;
  role: string | null;
};

function pickColumns(table: string, payload: Record<string, unknown>) {
  const allowed = TABLE_COLUMNS[table] ?? [];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (payload[key] === undefined) continue;
    let value = payload[key];
    if (BOOL_KEYS.has(key) && (value === 0 || value === 1 || value === '0' || value === '1')) {
      value = value === 1 || value === '1';
    }
    out[key] = value;
  }
  return out;
}

function canManageUsers(actor: Actor): boolean {
  return actor.role === 'OWNER' || actor.role === 'MANAGER';
}

async function getActor(userId: string): Promise<Actor | null> {
  const user = await AppDataSource.getRepository(User).findOne({ where: { id: userId } });
  if (!user) return null;
  return { id: user.id, business_id: user.business_id, role: user.role };
}

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

syncRouter.use(requireAuth);

syncRouter.get('/pull', async (req: AuthedRequest, res) => {
  try {
    const userId = req.auth!.sub;
    const users = AppDataSource.getRepository(User);
    const businesses = AppDataSource.getRepository(Business);

    const user = await users.findOne({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    let business = null;
    const tables: Record<string, unknown[]> = {};

    if (user.business_id) {
      business = await businesses.findOne({ where: { id: user.business_id } });

      const teammates = await users.find({ where: { business_id: user.business_id } });
      tables.users = teammates.map(publicUser);

      for (const [table, entity] of Object.entries(ENTITY_BY_TABLE)) {
        if (table === 'businesses' || table === 'users') continue;
        const rows = await AppDataSource.getRepository(entity).find({
          where: { business_id: user.business_id } as ObjectLiteral,
        });
        tables[table] = rows;
      }
    }

    res.json({ user: publicUser(user), business, tables });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Pull failed' });
  }
});

syncRouter.post('/:table', async (req: AuthedRequest, res) => {
  try {
    const table = String(req.params.table ?? '');
    const entity = ENTITY_BY_TABLE[table];
    if (!entity) {
      res.status(400).json({ error: 'Unknown table' });
      return;
    }

    const payload = pickColumns(table, req.body as Record<string, unknown>);
    if (!payload.id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    const userId = req.auth!.sub;
    const actor = await getActor(userId);
    if (!actor) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const repo = AppDataSource.getRepository(entity);

    if (table === 'users') {
      const targetId = String(payload.id);
      const isSelf = targetId === userId;

      if (!isSelf) {
        if (!canManageUsers(actor) || !actor.business_id) {
          res.status(403).json({ error: 'Cannot sync another user' });
          return;
        }
        if (String(payload.business_id ?? '') !== actor.business_id) {
          res.status(403).json({ error: 'Cannot sync user outside your business' });
          return;
        }
        if (payload.role === 'OWNER' && actor.role !== 'OWNER') {
          res.status(403).json({ error: 'Only owners can assign OWNER role' });
          return;
        }
      } else {
        delete payload.password_hash;
        const existing = await AppDataSource.getRepository(User).findOne({ where: { id: userId } });
        if (existing?.password_hash) {
          payload.password_hash = existing.password_hash;
        }
      }

      if (typeof payload.email === 'string') {
        payload.email = payload.email.trim().toLowerCase();
      }
    } else if (table === 'businesses') {
      const businessId = String(payload.id);
      if (actor.business_id && actor.business_id !== businessId) {
        res.status(403).json({ error: 'Business access denied' });
        return;
      }
    } else {
      const businessId = payload.business_id != null ? String(payload.business_id) : null;
      if (!businessId) {
        res.status(400).json({ error: 'business_id is required' });
        return;
      }
      if (actor.business_id) {
        if (actor.business_id !== businessId) {
          res.status(403).json({ error: 'Business access denied' });
          return;
        }
      } else {
        // No membership yet: only allow writes after the business row exists
        // (created in the same onboarding sync as users/businesses anchors).
        const biz = await AppDataSource.getRepository(Business).findOne({ where: { id: businessId } });
        if (!biz) {
          res.status(403).json({ error: 'Create or join a business first' });
          return;
        }
      }
    }

    const existing = await repo.findOne({ where: { id: payload.id } as ObjectLiteral });
    let saved: ObjectLiteral;
    if (existing) {
      if (table === 'users' && payload.password_hash == null) {
        delete payload.password_hash;
      }
      saved = await repo.save(repo.merge(existing, payload));
    } else {
      saved = await repo.save(repo.create(payload));
    }

    const usersRepo = AppDataSource.getRepository(User);

    if (table === 'users' && String(payload.id) === userId && payload.business_id) {
      await usersRepo.update(userId, {
        business_id: String(payload.business_id),
        updated_at: new Date(),
      });
    }

    if (table === 'businesses' && !actor.business_id) {
      await usersRepo.update(userId, {
        business_id: String(payload.id),
        role: (actor.role as User['role']) ?? 'OWNER',
        updated_at: new Date(),
      });
    }

    if (table === 'users') {
      const { password_hash: _pw, ...safe } = saved as User;
      res.json({ data: safe });
      return;
    }

    res.json({ data: saved });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Sync failed';
    res.status(500).json({ error: message });
  }
});

syncRouter.delete('/:table/:id', async (req: AuthedRequest, res) => {
  try {
    const table = String(req.params.table ?? '');
    const id = String(req.params.id ?? '');
    const entity = ENTITY_BY_TABLE[table];

    if (!entity || !id || table === 'businesses') {
      res.status(400).json({ error: 'Delete not allowed for this table' });
      return;
    }

    const actor = await getActor(req.auth!.sub);
    if (!actor?.business_id) {
      res.status(403).json({ error: 'No business' });
      return;
    }

    if (table === 'users') {
      if (!canManageUsers(actor)) {
        res.status(403).json({ error: 'Cannot delete users' });
        return;
      }
      if (id === req.auth!.sub) {
        res.status(400).json({ error: 'Cannot delete yourself' });
        return;
      }
      await AppDataSource.getRepository(User).delete({ id, business_id: actor.business_id });
      res.json({ ok: true });
      return;
    }

    await AppDataSource.getRepository(entity).delete({
      id,
      business_id: actor.business_id,
    } as ObjectLiteral);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Delete failed' });
  }
});

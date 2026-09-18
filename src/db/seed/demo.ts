import { getDatabase } from '../database';
import { hashPassword } from '@/utils/password';
import { queueSync } from '@/services/sync/queue';

/** Stable UUIDs — required for Supabase UUID primary keys. */
export const DEMO_BUSINESS = {
  id: 'a1000000-0000-4000-8000-000000000001',
  name: 'MIA Demo Shop',
  business_code: 'MIA-RW-DEMO',
  currency: 'RWF',
  country: 'Rwanda',
  timezone: 'Africa/Kigali',
} as const;

export const DEMO_USERS = [
  {
    id: 'a1000000-0000-4000-8000-000000000011',
    name: 'Jean Uwimana',
    email: 'owner@mia.rw',
    phone: '+250788100001',
    password: 'Owner123!',
    role: 'OWNER' as const,
  },
  {
    id: 'a1000000-0000-4000-8000-000000000012',
    name: 'Alice Mukamana',
    email: 'manager@mia.rw',
    phone: '+250788100002',
    password: 'Manager123!',
    role: 'MANAGER' as const,
  },
  {
    id: 'a1000000-0000-4000-8000-000000000013',
    name: 'Eric Niyonsenga',
    email: 'cashier@mia.rw',
    phone: '+250788100003',
    password: 'Cashier123!',
    role: 'CASHIER' as const,
  },
] as const;

export const PRIMARY_DEMO_LOGIN = {
  email: DEMO_USERS[0].email,
  password: DEMO_USERS[0].password,
} as const;

const DEMO_CATEGORIES = [
  { id: 'a1000000-0000-4000-8000-000000000101', name: 'Beverages', description: 'Drinks and beverages' },
  { id: 'a1000000-0000-4000-8000-000000000102', name: 'Food', description: 'Food items' },
  { id: 'a1000000-0000-4000-8000-000000000103', name: 'Household', description: 'Household items' },
  { id: 'a1000000-0000-4000-8000-000000000104', name: 'Personal Care', description: 'Personal care products' },
] as const;

const DEMO_PRODUCTS = [
  { id: 'a1000000-0000-4000-8000-000000000201', name: 'Coca Cola 500ml', sku: 'COC-500', barcode: '784567890123', category_id: DEMO_CATEGORIES[0].id, unit: 'pcs', selling_price: 800, average_cost: 500, reorder_level: 20 },
  { id: 'a1000000-0000-4000-8000-000000000202', name: 'Fanta Orange 500ml', sku: 'FAN-500', barcode: '784567890124', category_id: DEMO_CATEGORIES[0].id, unit: 'pcs', selling_price: 800, average_cost: 500, reorder_level: 20 },
  { id: 'a1000000-0000-4000-8000-000000000203', name: 'Sprite 500ml', sku: 'SPR-500', barcode: '784567890125', category_id: DEMO_CATEGORIES[0].id, unit: 'pcs', selling_price: 800, average_cost: 500, reorder_level: 20 },
  { id: 'a1000000-0000-4000-8000-000000000204', name: 'Bread Loaf', sku: 'BRD-001', barcode: '784567890126', category_id: DEMO_CATEGORIES[1].id, unit: 'pcs', selling_price: 1200, average_cost: 800, reorder_level: 10 },
  { id: 'a1000000-0000-4000-8000-000000000205', name: 'Milk 1L', sku: 'MLK-1L', barcode: '784567890127', category_id: DEMO_CATEGORIES[1].id, unit: 'pcs', selling_price: 1500, average_cost: 1000, reorder_level: 15 },
  { id: 'a1000000-0000-4000-8000-000000000206', name: 'Eggs Tray (30)', sku: 'EGG-30', barcode: '784567890128', category_id: DEMO_CATEGORIES[1].id, unit: 'tray', selling_price: 4500, average_cost: 3200, reorder_level: 5 },
  { id: 'a1000000-0000-4000-8000-000000000207', name: 'Soap Bar', sku: 'SOP-001', barcode: '784567890129', category_id: DEMO_CATEGORIES[2].id, unit: 'pcs', selling_price: 500, average_cost: 300, reorder_level: 20 },
  { id: 'a1000000-0000-4000-8000-000000000208', name: 'Toothpaste', sku: 'TTH-001', barcode: '784567890130', category_id: DEMO_CATEGORIES[3].id, unit: 'pcs', selling_price: 2500, average_cost: 1500, reorder_level: 10 },
] as const;

const DEMO_SUPPLIERS = [
  { id: 'a1000000-0000-4000-8000-000000000301', name: 'Bralirwa Ltd', phone: '+250788111111', email: 'orders@bralirwa.rw', address: 'Kigali, Rwanda' },
  { id: 'a1000000-0000-4000-8000-000000000302', name: 'Inyange Industries', phone: '+250788222222', email: 'sales@inyange.rw', address: 'Kigali, Rwanda' },
  { id: 'a1000000-0000-4000-8000-000000000303', name: 'BK TecHouse', phone: '+250788333333', email: 'supply@bk.rw', address: 'Kigali, Rwanda' },
] as const;

const DEMO_CUSTOMERS = [
  { id: 'a1000000-0000-4000-8000-000000000401', name: 'Walk-in Customer', phone: '', email: '', address: '', credit_limit: 0 },
  { id: 'a1000000-0000-4000-8000-000000000402', name: 'Jean Claude', phone: '+250788444444', email: 'jc@example.com', address: 'Kigali', credit_limit: 50000 },
  { id: 'a1000000-0000-4000-8000-000000000403', name: 'Marie Louise', phone: '+250788555555', email: 'ml@example.com', address: 'Kigali', credit_limit: 30000 },
] as const;

const OPENING_STOCK = [
  { product_id: DEMO_PRODUCTS[0].id, quantity: 100 },
  { product_id: DEMO_PRODUCTS[1].id, quantity: 80 },
  { product_id: DEMO_PRODUCTS[2].id, quantity: 60 },
  { product_id: DEMO_PRODUCTS[3].id, quantity: 30 },
  { product_id: DEMO_PRODUCTS[4].id, quantity: 50 },
  { product_id: DEMO_PRODUCTS[5].id, quantity: 20 },
  { product_id: DEMO_PRODUCTS[6].id, quantity: 100 },
  { product_id: DEMO_PRODUCTS[7].id, quantity: 40 },
] as const;

const LEGACY_ID_MAP: Record<string, string> = {
  'demo-business-001': DEMO_BUSINESS.id,
  'demo-user-owner': DEMO_USERS[0].id,
  'demo-user-manager': DEMO_USERS[1].id,
  'demo-user-cashier': DEMO_USERS[2].id,
  'cat-1': DEMO_CATEGORIES[0].id,
  'cat-2': DEMO_CATEGORIES[1].id,
  'cat-3': DEMO_CATEGORIES[2].id,
  'cat-4': DEMO_CATEGORIES[3].id,
  'prod-1': DEMO_PRODUCTS[0].id,
  'prod-2': DEMO_PRODUCTS[1].id,
  'prod-3': DEMO_PRODUCTS[2].id,
  'prod-4': DEMO_PRODUCTS[3].id,
  'prod-5': DEMO_PRODUCTS[4].id,
  'prod-6': DEMO_PRODUCTS[5].id,
  'prod-7': DEMO_PRODUCTS[6].id,
  'prod-8': DEMO_PRODUCTS[7].id,
  'sup-1': DEMO_SUPPLIERS[0].id,
  'sup-2': DEMO_SUPPLIERS[1].id,
  'sup-3': DEMO_SUPPLIERS[2].id,
  'cust-1': DEMO_CUSTOMERS[0].id,
  'cust-2': DEMO_CUSTOMERS[1].id,
  'cust-3': DEMO_CUSTOMERS[2].id,
};

async function ensurePasswordHashColumn(): Promise<void> {
  const db = await getDatabase();
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(users)');
  const names = new Set(columns.map((c) => c.name));

  if (!names.has('password_hash')) {
    await db.execAsync(
      `ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT 'legacy:unmigrated'`
    );
  }
}

/** Wipe legacy non-UUID demo rows so they can be re-seeded with valid UUIDs. */
async function purgeLegacyDemoIfNeeded(): Promise<void> {
  const db = await getDatabase();
  const legacy = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM businesses
     WHERE id = 'demo-business-001' OR (business_code = ? AND id != ?)
     LIMIT 1`,
    [DEMO_BUSINESS.business_code, DEMO_BUSINESS.id]
  );
  if (!legacy) return;
  if (legacy.id === DEMO_BUSINESS.id) return;

  const oldId = legacy.id;
  const tables = [
    'sync_records',
    'daily_closings',
    'payments',
    'expenses',
    'sale_items',
    'sales',
    'purchase_items',
    'purchases',
    'stock_movements',
    'customers',
    'suppliers',
    'products',
    'categories',
  ];

  for (const table of tables) {
    try {
      await db.runAsync(`DELETE FROM ${table} WHERE business_id = ?`, [oldId]);
    } catch {
      // Table may not exist on older local schemas
    }
  }
  await db.runAsync(`DELETE FROM users WHERE business_id = ?`, [oldId]);
  await db.runAsync(`DELETE FROM businesses WHERE id = ?`, [oldId]);

  for (const [old, next] of Object.entries(LEGACY_ID_MAP)) {
    if (old === oldId || old.startsWith('demo-user') || old.startsWith('cat-') || old.startsWith('prod-')) {
      try {
        await db.runAsync(`DELETE FROM sync_records WHERE record_id = ?`, [old]);
        await db.runAsync(`DELETE FROM sync_records WHERE record_id = ?`, [next]);
      } catch {
        // ignore
      }
    }
  }
}

async function ensureDemoBusiness(): Promise<string> {
  await purgeLegacyDemoIfNeeded();
  const db = await getDatabase();
  const now = new Date().toISOString();

  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM businesses WHERE id = ? OR business_code = ? LIMIT 1`,
    [DEMO_BUSINESS.id, DEMO_BUSINESS.business_code]
  );
  if (existing) {
    if (existing.id !== DEMO_BUSINESS.id) {
      await purgeLegacyDemoIfNeeded();
    } else {
      return DEMO_BUSINESS.id;
    }
  }

  await db.runAsync(
    `INSERT OR IGNORE INTO businesses (id, name, business_code, currency, country, timezone, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      DEMO_BUSINESS.id,
      DEMO_BUSINESS.name,
      DEMO_BUSINESS.business_code,
      DEMO_BUSINESS.currency,
      DEMO_BUSINESS.country,
      DEMO_BUSINESS.timezone,
      now,
      now,
    ]
  );
  return DEMO_BUSINESS.id;
}

async function upsertDemoUser(
  businessId: string,
  account: (typeof DEMO_USERS)[number]
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(account.password);
  const email = account.email.trim().toLowerCase();

  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM users WHERE lower(email) = ? LIMIT 1`,
    [email]
  );

  if (existing) {
    if (existing.id !== account.id) {
      await db.runAsync(`DELETE FROM users WHERE id = ?`, [existing.id]);
    } else {
      await db.runAsync(
        `UPDATE users
         SET name = ?, phone = ?, password_hash = ?, role = ?, business_id = ?, active = 1, updated_at = ?
         WHERE id = ?`,
        [account.name, account.phone, passwordHash, account.role, businessId, now, existing.id]
      );
      return;
    }
  }

  try {
    await db.runAsync(
      `INSERT INTO users
        (id, business_id, name, email, phone, password_hash, role, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [account.id, businessId, account.name, email, account.phone, passwordHash, account.role, now, now]
    );
  } catch {
    await db.runAsync(
      `UPDATE users
       SET business_id = ?, name = ?, email = ?, phone = ?, password_hash = ?, role = ?, active = 1, updated_at = ?
       WHERE id = ?`,
      [businessId, account.name, email, account.phone, passwordHash, account.role, now, account.id]
    );
  }
}

export async function ensureDemoUsers(businessId?: string): Promise<void> {
  await ensurePasswordHashColumn();
  const id = businessId ?? (await ensureDemoBusiness());

  for (const account of DEMO_USERS) {
    await upsertDemoUser(id, account);
  }

  const db = await getDatabase();
  const now = new Date().toISOString();
  const owner = DEMO_USERS[0];
  const ownerHash = await hashPassword(owner.password);
  const legacy = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM users WHERE lower(email) = ? LIMIT 1`,
    ['demo@mia.app']
  );
  if (legacy) {
    await db.runAsync(
      `UPDATE users
       SET password_hash = ?, business_id = ?, role = 'OWNER', active = 1, updated_at = ?
       WHERE id = ?`,
      [ownerHash, id, now, legacy.id]
    );
  }
}

async function queueDemoCatalog(businessId: string): Promise<void> {
  const db = await getDatabase();

  const business = await db.getFirstAsync<Record<string, unknown>>(
    `SELECT id, name, business_code, currency, country, timezone, created_at, updated_at
     FROM businesses WHERE id = ?`,
    [businessId]
  );
  if (business) {
    await queueSync('businesses', businessId, 'insert', business, businessId);
  }

  for (const account of DEMO_USERS) {
    const user = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT id, business_id, name, email, phone, role, active, created_at, updated_at
       FROM users WHERE id = ?`,
      [account.id]
    );
    if (user) {
      await queueSync('users', account.id, 'insert', user, businessId);
    }
  }

  for (const cat of DEMO_CATEGORIES) {
    const row = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM categories WHERE id = ?`,
      [cat.id]
    );
    if (row) await queueSync('categories', cat.id, 'insert', row, businessId);
  }

  for (const prod of DEMO_PRODUCTS) {
    const row = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT id, business_id, category_id, name, sku, barcode, unit, selling_price, average_cost,
              reorder_level, track_inventory, active, created_at, updated_at
       FROM products WHERE id = ?`,
      [prod.id]
    );
    if (row) await queueSync('products', prod.id, 'insert', row, businessId);
  }

  for (const sup of DEMO_SUPPLIERS) {
    const row = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM suppliers WHERE id = ?`,
      [sup.id]
    );
    if (row) await queueSync('suppliers', sup.id, 'insert', row, businessId);
  }

  for (const cust of DEMO_CUSTOMERS) {
    const row = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT * FROM customers WHERE id = ?`,
      [cust.id]
    );
    if (row) await queueSync('customers', cust.id, 'insert', row, businessId);
  }

  for (let i = 0; i < OPENING_STOCK.length; i++) {
    const smId = `a1000000-0000-4000-8000-0000000005${String(i + 1).padStart(2, '0')}`;
    const row = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT id, business_id, product_id, type, quantity, unit_cost, reference_type, reference_id,
              occurred_at, created_by, device_id, sync_status, created_at, updated_at
       FROM stock_movements WHERE id = ?`,
      [smId]
    );
    if (row) await queueSync('stock_movements', smId, 'insert', row, businessId);
  }
}

export async function seedDemoData(): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  const businessId = await ensureDemoBusiness();
  await ensureDemoUsers(businessId);

  const hasCatalog = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM products WHERE business_id = ? AND id = ? LIMIT 1`,
    [businessId, DEMO_PRODUCTS[0].id]
  );

  if (!hasCatalog) {
    const ownerId = DEMO_USERS[0].id;

    for (const cat of DEMO_CATEGORIES) {
      await db.runAsync(
        `INSERT OR IGNORE INTO categories (id, business_id, name, description, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [cat.id, businessId, cat.name, cat.description, 1, now, now]
      );
    }

    for (const prod of DEMO_PRODUCTS) {
      await db.runAsync(
        `INSERT OR IGNORE INTO products (id, business_id, category_id, name, sku, barcode, unit, selling_price, average_cost, reorder_level, track_inventory, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [prod.id, businessId, prod.category_id, prod.name, prod.sku, prod.barcode, prod.unit, prod.selling_price, prod.average_cost, prod.reorder_level, 1, 1, now, now]
      );
    }

    for (const sup of DEMO_SUPPLIERS) {
      await db.runAsync(
        `INSERT OR IGNORE INTO suppliers (id, business_id, name, phone, email, address, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sup.id, businessId, sup.name, sup.phone, sup.email, sup.address, 1, now, now]
      );
    }

    for (const cust of DEMO_CUSTOMERS) {
      await db.runAsync(
        `INSERT OR IGNORE INTO customers (id, business_id, name, phone, email, address, credit_limit, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cust.id, businessId, cust.name, cust.phone, cust.email, cust.address, cust.credit_limit, 1, now, now]
      );
    }

    for (let i = 0; i < OPENING_STOCK.length; i++) {
      const stock = OPENING_STOCK[i];
      const product = DEMO_PRODUCTS.find((p) => p.id === stock.product_id);
      if (!product) continue;
      const smId = `a1000000-0000-4000-8000-0000000005${String(i + 1).padStart(2, '0')}`;

      await db.runAsync(
        `INSERT OR IGNORE INTO stock_movements (id, business_id, product_id, type, quantity, unit_cost, reference_type, reference_id, occurred_at, created_by, device_id, sync_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          smId,
          businessId,
          stock.product_id,
          'opening',
          stock.quantity,
          product.average_cost,
          'opening_balance',
          null,
          now,
          ownerId,
          'demo-device',
          'pending',
          now,
          now,
        ]
      );
    }
  }

  const alreadyQueued = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM sync_records WHERE business_id = ? AND table_name = 'businesses' AND record_id = ? LIMIT 1`,
    [businessId, businessId]
  );
  if (!alreadyQueued || !hasCatalog) {
    await queueDemoCatalog(businessId);
  }
}

export async function clearAllData(): Promise<void> {
  const db = await getDatabase();

  const tables = [
    'sync_records',
    'daily_closings',
    'payments',
    'expenses',
    'sale_items',
    'sales',
    'purchase_items',
    'purchases',
    'stock_movements',
    'customers',
    'suppliers',
    'products',
    'categories',
    'users',
    'businesses',
  ];

  for (const table of tables) {
    await db.runAsync(`DELETE FROM ${table}`);
  }
}

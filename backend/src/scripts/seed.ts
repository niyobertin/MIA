import 'reflect-metadata';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { initDatabase, AppDataSource } from '../data-source';
import {
  Business,
  User,
  Category,
  Product,
  Supplier,
  Customer,
  StockMovement,
} from '../entities';
import { hashPassword } from '../lib/auth';

dotenv.config();

/** Same IDs/credentials as the mobile demo seed — multi-device login works with these. */
const DEMO_BUSINESS = {
  id: 'a1000000-0000-4000-8000-000000000001',
  name: 'MIA Demo Shop',
  business_code: 'MIA-RW-DEMO',
  currency: 'RWF',
  country: 'Rwanda',
  timezone: 'Africa/Kigali',
};

const DEMO_USERS = [
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
];

const DEMO_CATEGORIES = [
  { id: 'a1000000-0000-4000-8000-000000000101', name: 'Beverages', description: 'Drinks and beverages' },
  { id: 'a1000000-0000-4000-8000-000000000102', name: 'Food', description: 'Food items' },
  { id: 'a1000000-0000-4000-8000-000000000103', name: 'Household', description: 'Household items' },
  { id: 'a1000000-0000-4000-8000-000000000104', name: 'Personal Care', description: 'Personal care products' },
];

const DEMO_PRODUCTS = [
  { id: 'a1000000-0000-4000-8000-000000000201', name: 'Coca Cola 500ml', sku: 'COC-500', barcode: '784567890123', category_id: DEMO_CATEGORIES[0].id, unit: 'pcs', selling_price: 800, average_cost: 500, reorder_level: 20 },
  { id: 'a1000000-0000-4000-8000-000000000202', name: 'Fanta Orange 500ml', sku: 'FAN-500', barcode: '784567890124', category_id: DEMO_CATEGORIES[0].id, unit: 'pcs', selling_price: 800, average_cost: 500, reorder_level: 20 },
  { id: 'a1000000-0000-4000-8000-000000000203', name: 'Sprite 500ml', sku: 'SPR-500', barcode: '784567890125', category_id: DEMO_CATEGORIES[0].id, unit: 'pcs', selling_price: 800, average_cost: 500, reorder_level: 20 },
  { id: 'a1000000-0000-4000-8000-000000000204', name: 'Bread Loaf', sku: 'BRD-001', barcode: '784567890126', category_id: DEMO_CATEGORIES[1].id, unit: 'pcs', selling_price: 1200, average_cost: 800, reorder_level: 10 },
  { id: 'a1000000-0000-4000-8000-000000000205', name: 'Milk 1L', sku: 'MLK-1L', barcode: '784567890127', category_id: DEMO_CATEGORIES[1].id, unit: 'pcs', selling_price: 1500, average_cost: 1000, reorder_level: 15 },
  { id: 'a1000000-0000-4000-8000-000000000206', name: 'Eggs Tray (30)', sku: 'EGG-30', barcode: '784567890128', category_id: DEMO_CATEGORIES[1].id, unit: 'tray', selling_price: 4500, average_cost: 3200, reorder_level: 5 },
  { id: 'a1000000-0000-4000-8000-000000000207', name: 'Soap Bar', sku: 'SOP-001', barcode: '784567890129', category_id: DEMO_CATEGORIES[2].id, unit: 'pcs', selling_price: 500, average_cost: 300, reorder_level: 20 },
  { id: 'a1000000-0000-4000-8000-000000000208', name: 'Toothpaste', sku: 'TTH-001', barcode: '784567890130', category_id: DEMO_CATEGORIES[3].id, unit: 'pcs', selling_price: 2500, average_cost: 1500, reorder_level: 10 },
];

const DEMO_SUPPLIERS = [
  { id: 'a1000000-0000-4000-8000-000000000301', name: 'Bralirwa Ltd', phone: '+250788111111', email: 'orders@bralirwa.rw', address: 'Kigali, Rwanda' },
  { id: 'a1000000-0000-4000-8000-000000000302', name: 'Inyange Industries', phone: '+250788222222', email: 'sales@inyange.rw', address: 'Kigali, Rwanda' },
  { id: 'a1000000-0000-4000-8000-000000000303', name: 'BK TecHouse', phone: '+250788333333', email: 'supply@bk.rw', address: 'Kigali, Rwanda' },
];

const DEMO_CUSTOMERS = [
  { id: 'a1000000-0000-4000-8000-000000000401', name: 'Walk-in Customer', phone: null, email: null, address: null, credit_limit: 0 },
  { id: 'a1000000-0000-4000-8000-000000000402', name: 'Jean Claude', phone: '+250788444444', email: 'jc@example.com', address: 'Kigali', credit_limit: 50000 },
  { id: 'a1000000-0000-4000-8000-000000000403', name: 'Marie Louise', phone: '+250788555555', email: 'ml@example.com', address: 'Kigali', credit_limit: 30000 },
];

const OPENING_STOCK = [
  { product_id: DEMO_PRODUCTS[0].id, quantity: 100 },
  { product_id: DEMO_PRODUCTS[1].id, quantity: 80 },
  { product_id: DEMO_PRODUCTS[2].id, quantity: 60 },
  { product_id: DEMO_PRODUCTS[3].id, quantity: 40 },
  { product_id: DEMO_PRODUCTS[4].id, quantity: 50 },
  { product_id: DEMO_PRODUCTS[5].id, quantity: 25 },
  { product_id: DEMO_PRODUCTS[6].id, quantity: 90 },
  { product_id: DEMO_PRODUCTS[7].id, quantity: 35 },
];

async function upsert<T extends { id: string }>(
  entity: new () => T,
  rows: Partial<T>[]
) {
  const repo = AppDataSource.getRepository(entity);
  for (const row of rows) {
    await repo.save(repo.create(row as T));
  }
}

async function main() {
  await initDatabase({ synchronize: true });
  const now = new Date();
  const ownerId = DEMO_USERS[0].id;

  await upsert(Business, [{ ...DEMO_BUSINESS, created_at: now, updated_at: now }]);

  for (const u of DEMO_USERS) {
    await upsert(User, [
      {
        id: u.id,
        business_id: DEMO_BUSINESS.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        password_hash: await hashPassword(u.password),
        role: u.role,
        active: true,
        created_at: now,
        updated_at: now,
      },
    ]);
  }

  await upsert(
    Category,
    DEMO_CATEGORIES.map((c) => ({
      ...c,
      business_id: DEMO_BUSINESS.id,
      active: true,
      created_at: now,
      updated_at: now,
    }))
  );

  await upsert(
    Product,
    DEMO_PRODUCTS.map((p) => ({
      ...p,
      business_id: DEMO_BUSINESS.id,
      track_inventory: true,
      active: true,
      created_at: now,
      updated_at: now,
    }))
  );

  await upsert(
    Supplier,
    DEMO_SUPPLIERS.map((s) => ({
      ...s,
      business_id: DEMO_BUSINESS.id,
      active: true,
      created_at: now,
      updated_at: now,
    }))
  );

  await upsert(
    Customer,
    DEMO_CUSTOMERS.map((c) => ({
      ...c,
      business_id: DEMO_BUSINESS.id,
      active: true,
      created_at: now,
      updated_at: now,
    }))
  );

  // Stable opening stock movement IDs so re-seed is idempotent
  const movements = OPENING_STOCK.map((s, i) => ({
    id: `a1000000-0000-4000-8000-0000000005${String(i + 1).padStart(2, '0')}`,
    business_id: DEMO_BUSINESS.id,
    product_id: s.product_id,
    type: 'opening',
    quantity: s.quantity,
    unit_cost: DEMO_PRODUCTS.find((p) => p.id === s.product_id)?.average_cost ?? 0,
    reference_type: 'opening_balance',
    reference_id: null,
    occurred_at: now,
    created_by: ownerId,
    device_id: 'seed-script',
    sync_status: 'synced',
    created_at: now,
    updated_at: now,
  }));
  await upsert(StockMovement, movements);

  console.log('Seed complete.');
  console.log('');
  console.log('Demo business code:', DEMO_BUSINESS.business_code);
  console.log('Logins:');
  for (const u of DEMO_USERS) {
    console.log(`  ${u.role.padEnd(8)} ${u.email} / ${u.password}`);
  }

  await AppDataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

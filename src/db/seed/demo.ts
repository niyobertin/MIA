import { getDatabase } from '../database';
import { businessRepository } from '@/repositories/business/business';
import { userRepository } from '@/repositories/users/users';
import { categoryRepository } from '@/repositories/products/products';
import { productRepository } from '@/repositories/products/products';
import { supplierRepository } from '@/repositories/purchases/suppliers';
import { customerRepository } from '@/repositories/sales/customers';

export async function seedDemoData(): Promise<void> {
  const db = await getDatabase();
  
  // Check if already seeded
  const existingBusiness = await db.getFirstAsync<{ id: string }>('SELECT id FROM businesses LIMIT 1');
  if (existingBusiness) return;

  const now = new Date().toISOString();
  const businessId = 'demo-business-001';
  
  // Create demo business
  const business = {
    id: businessId,
    name: 'MIA Demo Shop',
    business_code: 'MIA-RW-DEMO',
    currency: 'RWF',
    country: 'Rwanda',
    timezone: 'Africa/Kigali',
    created_at: now,
    updated_at: now,
  };
  
  await db.runAsync(
    `INSERT INTO businesses (id, name, business_code, currency, country, timezone, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [business.id, business.name, business.business_code, business.currency, business.country, business.timezone, business.created_at, business.updated_at]
  );

  // Create demo user
  const userId = 'demo-user-001';
  await db.runAsync(
    `INSERT INTO users (id, business_id, name, email, phone, role, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, businessId, 'Demo Owner', 'demo@mia.app', '+250788123456', 'OWNER', 1, now, now]
  );

  // Create categories
  const categories = [
    { id: 'cat-1', name: 'Beverages', description: 'Drinks and beverages' },
    { id: 'cat-2', name: 'Food', description: 'Food items' },
    { id: 'cat-3', name: 'Household', description: 'Household items' },
    { id: 'cat-4', name: 'Personal Care', description: 'Personal care products' },
  ];

  for (const cat of categories) {
    await db.runAsync(
      `INSERT INTO categories (id, business_id, name, description, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [cat.id, businessId, cat.name, cat.description, 1, now, now]
    );
  }

  // Create products
  const products = [
    { id: 'prod-1', name: 'Coca Cola 500ml', sku: 'COC-500', barcode: '784567890123', category_id: 'cat-1', unit: 'pcs', selling_price: 800, average_cost: 500, reorder_level: 20 },
    { id: 'prod-2', name: 'Fanta Orange 500ml', sku: 'FAN-500', barcode: '784567890124', category_id: 'cat-1', unit: 'pcs', selling_price: 800, average_cost: 500, reorder_level: 20 },
    { id: 'prod-3', name: 'Sprite 500ml', sku: 'SPR-500', barcode: '784567890125', category_id: 'cat-1', unit: 'pcs', selling_price: 800, average_cost: 500, reorder_level: 20 },
    { id: 'prod-4', name: 'Bread Loaf', sku: 'BRD-001', barcode: '784567890126', category_id: 'cat-2', unit: 'pcs', selling_price: 1200, average_cost: 800, reorder_level: 10 },
    { id: 'prod-5', name: 'Milk 1L', sku: 'MLK-1L', barcode: '784567890127', category_id: 'cat-2', unit: 'pcs', selling_price: 1500, average_cost: 1000, reorder_level: 15 },
    { id: 'prod-6', name: 'Eggs Tray (30)', sku: 'EGG-30', barcode: '784567890128', category_id: 'cat-2', unit: 'tray', selling_price: 4500, average_cost: 3200, reorder_level: 5 },
    { id: 'prod-7', name: 'Soap Bar', sku: 'SOP-001', barcode: '784567890129', category_id: 'cat-3', unit: 'pcs', selling_price: 500, average_cost: 300, reorder_level: 20 },
    { id: 'prod-8', name: 'Toothpaste', sku: 'TTH-001', barcode: '784567890130', category_id: 'cat-4', unit: 'pcs', selling_price: 2500, average_cost: 1500, reorder_level: 10 },
  ];

  for (const prod of products) {
    await db.runAsync(
      `INSERT INTO products (id, business_id, category_id, name, sku, barcode, unit, selling_price, average_cost, reorder_level, track_inventory, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [prod.id, businessId, prod.category_id, prod.name, prod.sku, prod.barcode, prod.unit, prod.selling_price, prod.average_cost, prod.reorder_level, 1, 1, now, now]
    );
  }

  // Create suppliers
  const suppliers = [
    { id: 'sup-1', name: 'Bralirwa Ltd', phone: '+250788111111', email: 'orders@bralirwa.rw', address: 'Kigali, Rwanda' },
    { id: 'sup-2', name: 'Inyange Industries', phone: '+250788222222', email: 'sales@inyange.rw', address: 'Kigali, Rwanda' },
    { id: 'sup-3', name: 'BK TecHouse', phone: '+250788333333', email: 'supply@bk.rw', address: 'Kigali, Rwanda' },
  ];

  for (const sup of suppliers) {
    await db.runAsync(
      `INSERT INTO suppliers (id, business_id, name, phone, email, address, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sup.id, businessId, sup.name, sup.phone, sup.email, sup.address, 1, now, now]
    );
  }

  // Create customers
  const customers = [
    { id: 'cust-1', name: 'Walk-in Customer', phone: '', email: '', address: '', credit_limit: 0 },
    { id: 'cust-2', name: 'Jean Claude', phone: '+250788444444', email: 'jc@example.com', address: 'Kigali', credit_limit: 50000 },
    { id: 'cust-3', name: 'Marie Louise', phone: '+250788555555', email: 'ml@example.com', address: 'Kigali', credit_limit: 30000 },
  ];

  for (const cust of customers) {
    await db.runAsync(
      `INSERT INTO customers (id, business_id, name, phone, email, address, credit_limit, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cust.id, businessId, cust.name, cust.phone, cust.email, cust.address, cust.credit_limit, 1, now, now]
    );
  }

  // Create opening stock movements
  const openingStock = [
    { product_id: 'prod-1', quantity: 100 },
    { product_id: 'prod-2', quantity: 80 },
    { product_id: 'prod-3', quantity: 60 },
    { product_id: 'prod-4', quantity: 30 },
    { product_id: 'prod-5', quantity: 50 },
    { product_id: 'prod-6', quantity: 20 },
    { product_id: 'prod-7', quantity: 100 },
    { product_id: 'prod-8', quantity: 40 },
  ];

  for (const stock of openingStock) {
    const product = products.find(p => p.id === stock.product_id);
    if (!product) continue;
    
    await db.runAsync(
      `INSERT INTO stock_movements (id, business_id, product_id, type, quantity, unit_cost, reference_type, reference_id, occurred_at, created_by, device_id, sync_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `sm-${stock.product_id}-opening`,
        businessId,
        stock.product_id,
        'opening',
        stock.quantity,
        product.average_cost,
        'opening_balance',
        null,
        now,
        userId,
        'demo-device',
        'synced',
        now,
        now,
      ]
    );
  }

  console.log('Demo data seeded successfully');
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
  
  console.log('All data cleared');
}

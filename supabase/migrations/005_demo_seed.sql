-- Demo seed for Supabase (valid UUIDs)
-- Run in SQL Editor after 001–004. Safe to re-run.

INSERT INTO businesses (id, name, business_code, currency, country, timezone, created_at, updated_at)
VALUES (
  'a1000000-0000-4000-8000-000000000001',
  'MIA Demo Shop',
  'MIA-RW-DEMO',
  'RWF',
  'Rwanda',
  'Africa/Kigali',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  business_code = EXCLUDED.business_code,
  currency = EXCLUDED.currency,
  country = EXCLUDED.country,
  timezone = EXCLUDED.timezone,
  updated_at = NOW();

DELETE FROM businesses
WHERE business_code = 'MIA-RW-DEMO'
  AND id <> 'a1000000-0000-4000-8000-000000000001';

INSERT INTO users (id, business_id, name, email, phone, role, active, created_at, updated_at)
VALUES
  ('a1000000-0000-4000-8000-000000000011', 'a1000000-0000-4000-8000-000000000001', 'Jean Uwimana', 'owner@mia.rw', '+250788100001', 'OWNER', TRUE, NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000012', 'a1000000-0000-4000-8000-000000000001', 'Alice Mukamana', 'manager@mia.rw', '+250788100002', 'MANAGER', TRUE, NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000013', 'a1000000-0000-4000-8000-000000000001', 'Eric Niyonsenga', 'cashier@mia.rw', '+250788100003', 'CASHIER', TRUE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  business_id = EXCLUDED.business_id,
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  role = EXCLUDED.role,
  active = EXCLUDED.active,
  updated_at = NOW();

INSERT INTO categories (id, business_id, name, description, active, created_at, updated_at)
VALUES
  ('a1000000-0000-4000-8000-000000000101', 'a1000000-0000-4000-8000-000000000001', 'Beverages', 'Drinks and beverages', TRUE, NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000102', 'a1000000-0000-4000-8000-000000000001', 'Food', 'Food items', TRUE, NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000103', 'a1000000-0000-4000-8000-000000000001', 'Household', 'Household items', TRUE, NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000104', 'a1000000-0000-4000-8000-000000000001', 'Personal Care', 'Personal care products', TRUE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO products (id, business_id, category_id, name, sku, barcode, unit, selling_price, average_cost, reorder_level, track_inventory, active, created_at, updated_at)
VALUES
  ('a1000000-0000-4000-8000-000000000201', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000101', 'Coca Cola 500ml', 'COC-500', '784567890123', 'pcs', 800, 500, 20, TRUE, TRUE, NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000202', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000101', 'Fanta Orange 500ml', 'FAN-500', '784567890124', 'pcs', 800, 500, 20, TRUE, TRUE, NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000203', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000101', 'Sprite 500ml', 'SPR-500', '784567890125', 'pcs', 800, 500, 20, TRUE, TRUE, NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000204', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000102', 'Bread Loaf', 'BRD-001', '784567890126', 'pcs', 1200, 800, 10, TRUE, TRUE, NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000205', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000102', 'Milk 1L', 'MLK-1L', '784567890127', 'pcs', 1500, 1000, 15, TRUE, TRUE, NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000206', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000102', 'Eggs Tray (30)', 'EGG-30', '784567890128', 'tray', 4500, 3200, 5, TRUE, TRUE, NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000207', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000103', 'Soap Bar', 'SOP-001', '784567890129', 'pcs', 500, 300, 20, TRUE, TRUE, NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000208', 'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000104', 'Toothpaste', 'TTH-001', '784567890130', 'pcs', 2500, 1500, 10, TRUE, TRUE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO suppliers (id, business_id, name, phone, email, address, active, created_at, updated_at)
VALUES
  ('a1000000-0000-4000-8000-000000000301', 'a1000000-0000-4000-8000-000000000001', 'Bralirwa Ltd', '+250788111111', 'orders@bralirwa.rw', 'Kigali, Rwanda', TRUE, NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000302', 'a1000000-0000-4000-8000-000000000001', 'Inyange Industries', '+250788222222', 'sales@inyange.rw', 'Kigali, Rwanda', TRUE, NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000303', 'a1000000-0000-4000-8000-000000000001', 'BK TecHouse', '+250788333333', 'supply@bk.rw', 'Kigali, Rwanda', TRUE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO customers (id, business_id, name, phone, email, address, credit_limit, active, created_at, updated_at)
VALUES
  ('a1000000-0000-4000-8000-000000000401', 'a1000000-0000-4000-8000-000000000001', 'Walk-in Customer', '', '', '', 0, TRUE, NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000402', 'a1000000-0000-4000-8000-000000000001', 'Jean Claude', '+250788444444', 'jc@example.com', 'Kigali', 50000, TRUE, NOW(), NOW()),
  ('a1000000-0000-4000-8000-000000000403', 'a1000000-0000-4000-8000-000000000001', 'Marie Louise', '+250788555555', 'ml@example.com', 'Kigali', 30000, TRUE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

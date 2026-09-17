-- MIA Database Schema for Supabase (PostgreSQL)
-- This migration creates all tables with proper RLS policies

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Businesses table
CREATE TABLE businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  business_code TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL DEFAULT 'RWF',
  country TEXT NOT NULL DEFAULT 'Rwanda',
  timezone TEXT NOT NULL DEFAULT 'Africa/Kigali',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users/Profiles table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'MANAGER', 'CASHIER', 'STAFF')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, email)
);

-- Categories table
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Products table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  selling_price BIGINT NOT NULL DEFAULT 0,
  average_cost BIGINT NOT NULL DEFAULT 0,
  reorder_level BIGINT NOT NULL DEFAULT 0,
  track_inventory BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Suppliers table
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Customers table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  credit_limit BIGINT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Stock movements table
CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('opening', 'purchase', 'sale', 'return_in', 'return_out', 'adjustment_in', 'adjustment_out', 'damaged')),
  quantity BIGINT NOT NULL,
  unit_cost BIGINT NOT NULL DEFAULT 0,
  reference_type TEXT CHECK (reference_type IN ('purchase', 'sale', 'purchase_return', 'sale_return', 'adjustment', 'opening_balance')),
  reference_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  device_id TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Purchases table
CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  reference_number TEXT,
  total_amount BIGINT NOT NULL DEFAULT 0,
  paid_amount BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  purchase_date TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  device_id TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Purchase items table
CREATE TABLE purchase_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity BIGINT NOT NULL,
  unit_cost BIGINT NOT NULL,
  total_cost BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sales table
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  reference_number TEXT,
  subtotal BIGINT NOT NULL DEFAULT 0,
  discount_amount BIGINT NOT NULL DEFAULT 0,
  tax_amount BIGINT NOT NULL DEFAULT 0,
  total_amount BIGINT NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'partial', 'unpaid', 'credit')),
  sale_date TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  device_id TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sale items table
CREATE TABLE sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity BIGINT NOT NULL,
  selling_price BIGINT NOT NULL,
  unit_cost BIGINT NOT NULL,
  discount_amount BIGINT NOT NULL DEFAULT 0,
  tax_amount BIGINT NOT NULL DEFAULT 0,
  total_amount BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Expenses table
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('transport', 'rent', 'electricity', 'water', 'food', 'salary', 'communication', 'maintenance', 'tax', 'other')),
  amount BIGINT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'mobile_money', 'bank', 'credit')),
  description TEXT,
  expense_date TIMESTAMPTZ NOT NULL,
  reference_number TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  device_id TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payments table
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('customer_payment', 'supplier_payment', 'sale_payment', 'purchase_payment', 'expense_payment', 'withdrawal', 'other_income')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'mobile_money', 'bank', 'credit')),
  amount BIGINT NOT NULL,
  reference_type TEXT CHECK (reference_type IN ('sale', 'purchase', 'expense', 'customer', 'supplier', 'withdrawal', 'other')),
  reference_id UUID,
  party_id UUID,
  payment_date TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  device_id TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily closings table
CREATE TABLE daily_closings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  opening_cash BIGINT NOT NULL DEFAULT 0,
  cash_sales BIGINT NOT NULL DEFAULT 0,
  customer_cash_payments BIGINT NOT NULL DEFAULT 0,
  other_cash_income BIGINT NOT NULL DEFAULT 0,
  cash_purchases BIGINT NOT NULL DEFAULT 0,
  cash_expenses BIGINT NOT NULL DEFAULT 0,
  supplier_cash_payments BIGINT NOT NULL DEFAULT 0,
  withdrawals BIGINT NOT NULL DEFAULT 0,
  expected_cash BIGINT NOT NULL DEFAULT 0,
  actual_cash BIGINT NOT NULL DEFAULT 0,
  cash_variance BIGINT NOT NULL DEFAULT 0,
  total_sales BIGINT NOT NULL DEFAULT 0,
  cogs BIGINT NOT NULL DEFAULT 0,
  gross_profit BIGINT NOT NULL DEFAULT 0,
  expenses BIGINT NOT NULL DEFAULT 0,
  net_profit BIGINT NOT NULL DEFAULT 0,
  notes TEXT,
  closed_by UUID REFERENCES users(id),
  closed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'reopened')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, business_date)
);

-- Sync records table
CREATE TABLE sync_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  payload JSONB NOT NULL,
  device_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'syncing', 'synced', 'failed')),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_users_business_id ON users(business_id);
CREATE INDEX idx_users_email ON users(email);

CREATE INDEX idx_categories_business_id ON categories(business_id);

CREATE INDEX idx_products_business_id ON products(business_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode);

CREATE INDEX idx_suppliers_business_id ON suppliers(business_id);

CREATE INDEX idx_customers_business_id ON customers(business_id);

CREATE INDEX idx_stock_movements_business_id ON stock_movements(business_id);
CREATE INDEX idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_occurred_at ON stock_movements(occurred_at);
CREATE INDEX idx_stock_movements_sync_status ON stock_movements(sync_status);
CREATE INDEX idx_stock_movements_reference ON stock_movements(reference_type, reference_id);

CREATE INDEX idx_purchases_business_id ON purchases(business_id);
CREATE INDEX idx_purchases_supplier_id ON purchases(supplier_id);
CREATE INDEX idx_purchases_purchase_date ON purchases(purchase_date);
CREATE INDEX idx_purchases_sync_status ON purchases(sync_status);

CREATE INDEX idx_purchase_items_purchase_id ON purchase_items(purchase_id);
CREATE INDEX idx_purchase_items_product_id ON purchase_items(product_id);

CREATE INDEX idx_sales_business_id ON sales(business_id);
CREATE INDEX idx_sales_customer_id ON sales(customer_id);
CREATE INDEX idx_sales_sale_date ON sales(sale_date);
CREATE INDEX idx_sales_sync_status ON sales(sync_status);

CREATE INDEX idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product_id ON sale_items(product_id);

CREATE INDEX idx_expenses_business_id ON expenses(business_id);
CREATE INDEX idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX idx_expenses_sync_status ON expenses(sync_status);

CREATE INDEX idx_payments_business_id ON payments(business_id);
CREATE INDEX idx_payments_payment_date ON payments(payment_date);
CREATE INDEX idx_payments_sync_status ON payments(sync_status);
CREATE INDEX idx_payments_reference ON payments(reference_type, reference_id);
CREATE INDEX idx_payments_party ON payments(party_id);

CREATE INDEX idx_daily_closings_business_id ON daily_closings(business_id);
CREATE INDEX idx_daily_closings_business_date ON daily_closings(business_date);

CREATE INDEX idx_sync_records_business_id ON sync_records(business_id);
CREATE INDEX idx_sync_records_status ON sync_records(status);
CREATE INDEX idx_sync_records_table_record ON sync_records(table_name, record_id);
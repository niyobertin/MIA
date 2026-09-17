-- MIA Row Level Security Policies
-- This migration enables RLS and creates policies for multi-tenant isolation

-- Enable RLS on all tables
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_records ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's business_id
CREATE OR REPLACE FUNCTION get_current_business_id()
RETURNS UUID AS $$
DECLARE
  business_uuid UUID;
BEGIN
  -- Get business_id from the authenticated user's profile
  SELECT business_id INTO business_uuid
  FROM users
  WHERE id = auth.uid();
  
  RETURN business_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Businesses policies
-- Users can only see their own business
CREATE POLICY "Users can view their business" ON businesses
  FOR SELECT USING (id = get_current_business_id());

CREATE POLICY "Owners can update their business" ON businesses
  FOR UPDATE USING (
    id = get_current_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'OWNER')
  );

-- Users policies
-- Users can view users in their business
CREATE POLICY "Users can view business users" ON users
  FOR SELECT USING (business_id = get_current_business_id());

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (id = auth.uid());

-- Owners can manage all users in their business
CREATE POLICY "Owners can manage business users" ON users
  FOR ALL USING (
    business_id = get_current_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'OWNER')
  );

-- Managers can view all users in their business
CREATE POLICY "Managers can view business users" ON users
  FOR SELECT USING (
    business_id = get_current_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))
  );

-- Categories policies
CREATE POLICY "Users can view business categories" ON categories
  FOR SELECT USING (business_id = get_current_business_id());

CREATE POLICY "Managers can manage categories" ON categories
  FOR ALL USING (
    business_id = get_current_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))
  );

-- Products policies
CREATE POLICY "Users can view business products" ON products
  FOR SELECT USING (business_id = get_current_business_id());

CREATE POLICY "Managers can manage products" ON products
  FOR ALL USING (
    business_id = get_current_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))
  );

-- Suppliers policies
CREATE POLICY "Users can view business suppliers" ON suppliers
  FOR SELECT USING (business_id = get_current_business_id());

CREATE POLICY "Managers can manage suppliers" ON suppliers
  FOR ALL USING (
    business_id = get_current_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))
  );

-- Customers policies
CREATE POLICY "Users can view business customers" ON customers
  FOR SELECT USING (business_id = get_current_business_id());

CREATE POLICY "Cashiers and above can manage customers" ON customers
  FOR ALL USING (
    business_id = get_current_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER', 'CASHIER'))
  );

-- Stock movements policies
CREATE POLICY "Users can view business stock movements" ON stock_movements
  FOR SELECT USING (business_id = get_current_business_id());

CREATE POLICY "Cashiers and above can create stock movements" ON stock_movements
  FOR INSERT WITH CHECK (
    business_id = get_current_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER', 'CASHIER'))
  );

CREATE POLICY "Owners and managers can update stock movements" ON stock_movements
  FOR UPDATE USING (
    business_id = get_current_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))
  );

-- Purchases policies
CREATE POLICY "Users can view business purchases" ON purchases
  FOR SELECT USING (business_id = get_current_business_id());

CREATE POLICY "Managers can manage purchases" ON purchases
  FOR ALL USING (
    business_id = get_current_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))
  );

-- Purchase items policies
CREATE POLICY "Users can view business purchase items" ON purchase_items
  FOR SELECT USING (business_id = get_current_business_id());

CREATE POLICY "Managers can manage purchase items" ON purchase_items
  FOR ALL USING (
    business_id = get_current_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))
  );

-- Sales policies
CREATE POLICY "Users can view business sales" ON sales
  FOR SELECT USING (business_id = get_current_business_id());

CREATE POLICY "Cashiers and above can create sales" ON sales
  FOR INSERT WITH CHECK (
    business_id = get_current_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER', 'CASHIER'))
  );

CREATE POLICY "Managers can update sales" ON sales
  FOR UPDATE USING (
    business_id = get_current_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))
  );

-- Sale items policies
CREATE POLICY "Users can view business sale items" ON sale_items
  FOR SELECT USING (business_id = get_current_business_id());

CREATE POLICY "Cashiers and above can create sale items" ON sale_items
  FOR INSERT WITH CHECK (
    business_id = get_current_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER', 'CASHIER'))
  );

-- Expenses policies
CREATE POLICY "Users can view business expenses" ON expenses
  FOR SELECT USING (business_id = get_current_business_id());

CREATE POLICY "Cashiers and above can create expenses" ON expenses
  FOR INSERT WITH CHECK (
    business_id = get_current_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER', 'CASHIER'))
  );

CREATE POLICY "Managers can update expenses" ON expenses
  FOR UPDATE USING (
    business_id = get_current_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))
  );

-- Payments policies
CREATE POLICY "Users can view business payments" ON payments
  FOR SELECT USING (business_id = get_current_business_id());

CREATE POLICY "Cashiers and above can create payments" ON payments
  FOR INSERT WITH CHECK (
    business_id = get_current_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER', 'CASHIER'))
  );

CREATE POLICY "Managers can update payments" ON payments
  FOR UPDATE USING (
    business_id = get_current_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))
  );

-- Daily closings policies
CREATE POLICY "Users can view business daily closings" ON daily_closings
  FOR SELECT USING (business_id = get_current_business_id());

CREATE POLICY "Managers can manage daily closings" ON daily_closings
  FOR ALL USING (
    business_id = get_current_business_id() AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('OWNER', 'MANAGER'))
  );

-- Sync records policies
CREATE POLICY "Users can view business sync records" ON sync_records
  FOR SELECT USING (business_id = get_current_business_id());

CREATE POLICY "System can manage sync records" ON sync_records
  FOR ALL USING (business_id = get_current_business_id());

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
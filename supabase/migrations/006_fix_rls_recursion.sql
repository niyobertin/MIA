-- Fix RLS infinite recursion (42P17) on users / businesses
-- Cause: policies on "users" (and helpers) SELECT from "users" under RLS again.
-- Fix: SECURITY DEFINER helpers that bypass RLS; users policies never query users directly.

CREATE OR REPLACE FUNCTION public.get_current_business_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT business_id
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_business_member(target_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND business_id = target_business_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_current_business_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_business_member(uuid) TO anon, authenticated;

-- Recreate users policies without self-referential SELECTs
DROP POLICY IF EXISTS "Users can view business users" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Owners can manage business users" ON users;
DROP POLICY IF EXISTS "Managers can view business users" ON users;
DROP POLICY IF EXISTS "Users can claim ownership of a new business" ON users;
DROP POLICY IF EXISTS "Users can attach to a business when unassigned" ON users;
DROP POLICY IF EXISTS "Owners can add business users" ON users;

CREATE POLICY "Users can view business users" ON users
  FOR SELECT
  USING (
    id = auth.uid()
    OR business_id = public.get_current_business_id()
  );

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Owners can manage business users" ON users
  FOR ALL
  USING (
    business_id = public.get_current_business_id()
    AND public.current_user_role() = 'OWNER'
  )
  WITH CHECK (
    business_id = public.get_current_business_id()
    AND public.current_user_role() = 'OWNER'
  );

CREATE POLICY "Users can claim ownership of a new business" ON users
  FOR INSERT
  WITH CHECK (
    id = auth.uid()
    AND (
      business_id IS NULL
      OR role = 'OWNER'
    )
  );

CREATE POLICY "Users can attach to a business when unassigned" ON users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND (
      business_id IS NULL
      OR business_id = public.get_current_business_id()
      OR public.get_current_business_id() IS NULL
    )
  );

CREATE POLICY "Owners can add business users" ON users
  FOR INSERT
  WITH CHECK (
    business_id = public.get_current_business_id()
    AND public.current_user_role() = 'OWNER'
  );

-- Businesses update policy also queried users directly
DROP POLICY IF EXISTS "Owners can update their business" ON businesses;
CREATE POLICY "Owners can update their business" ON businesses
  FOR UPDATE
  USING (
    id = public.get_current_business_id()
    AND public.current_user_role() = 'OWNER'
  )
  WITH CHECK (
    id = public.get_current_business_id()
    AND public.current_user_role() = 'OWNER'
  );

-- Replace EXISTS (SELECT … FROM users) role checks with helpers
-- Categories
DROP POLICY IF EXISTS "Managers can manage categories" ON categories;
CREATE POLICY "Managers can manage categories" ON categories
  FOR ALL
  USING (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER')
  )
  WITH CHECK (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER')
  );

-- Products
DROP POLICY IF EXISTS "Managers can manage products" ON products;
CREATE POLICY "Managers can manage products" ON products
  FOR ALL
  USING (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER')
  )
  WITH CHECK (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER')
  );

-- Suppliers
DROP POLICY IF EXISTS "Managers can manage suppliers" ON suppliers;
CREATE POLICY "Managers can manage suppliers" ON suppliers
  FOR ALL
  USING (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER')
  )
  WITH CHECK (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER')
  );

-- Customers
DROP POLICY IF EXISTS "Cashiers and above can manage customers" ON customers;
CREATE POLICY "Cashiers and above can manage customers" ON customers
  FOR ALL
  USING (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER', 'CASHIER')
  )
  WITH CHECK (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER', 'CASHIER')
  );

-- Stock movements
DROP POLICY IF EXISTS "Cashiers and above can create stock movements" ON stock_movements;
DROP POLICY IF EXISTS "Owners and managers can update stock movements" ON stock_movements;
CREATE POLICY "Cashiers and above can create stock movements" ON stock_movements
  FOR INSERT
  WITH CHECK (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER', 'CASHIER')
  );
CREATE POLICY "Owners and managers can update stock movements" ON stock_movements
  FOR UPDATE
  USING (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER')
  );

-- Purchases
DROP POLICY IF EXISTS "Managers can manage purchases" ON purchases;
CREATE POLICY "Managers can manage purchases" ON purchases
  FOR ALL
  USING (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER')
  )
  WITH CHECK (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER')
  );

DROP POLICY IF EXISTS "Managers can manage purchase items" ON purchase_items;
CREATE POLICY "Managers can manage purchase items" ON purchase_items
  FOR ALL
  USING (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER')
  )
  WITH CHECK (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER')
  );

-- Sales
DROP POLICY IF EXISTS "Cashiers and above can create sales" ON sales;
DROP POLICY IF EXISTS "Managers can update sales" ON sales;
CREATE POLICY "Cashiers and above can create sales" ON sales
  FOR INSERT
  WITH CHECK (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER', 'CASHIER')
  );
CREATE POLICY "Managers can update sales" ON sales
  FOR UPDATE
  USING (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER')
  );

DROP POLICY IF EXISTS "Cashiers and above can create sale items" ON sale_items;
CREATE POLICY "Cashiers and above can create sale items" ON sale_items
  FOR INSERT
  WITH CHECK (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER', 'CASHIER')
  );

-- Expenses
DROP POLICY IF EXISTS "Cashiers and above can create expenses" ON expenses;
DROP POLICY IF EXISTS "Managers can update expenses" ON expenses;
CREATE POLICY "Cashiers and above can create expenses" ON expenses
  FOR INSERT
  WITH CHECK (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER', 'CASHIER')
  );
CREATE POLICY "Managers can update expenses" ON expenses
  FOR UPDATE
  USING (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER')
  );

-- Payments
DROP POLICY IF EXISTS "Cashiers and above can create payments" ON payments;
DROP POLICY IF EXISTS "Managers can update payments" ON payments;
CREATE POLICY "Cashiers and above can create payments" ON payments
  FOR INSERT
  WITH CHECK (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER', 'CASHIER')
  );
CREATE POLICY "Managers can update payments" ON payments
  FOR UPDATE
  USING (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER')
  );

-- Daily closings
DROP POLICY IF EXISTS "Managers can manage daily closings" ON daily_closings;
CREATE POLICY "Managers can manage daily closings" ON daily_closings
  FOR ALL
  USING (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER')
  )
  WITH CHECK (
    business_id = public.get_current_business_id()
    AND public.current_user_role() IN ('OWNER', 'MANAGER')
  );

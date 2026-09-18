-- Offline device sync policies
-- Local MIA auth does not use Supabase Auth (auth.uid() is null with the anon key).
-- Until Supabase Auth is wired, allow the anon key to upsert business data so
-- offline-first devices can push to Postgres. Protect the project with the anon key
-- and keep RLS enabled for authenticated users.

-- Businesses
CREATE POLICY "anon_device_select_businesses" ON businesses FOR SELECT TO anon USING (true);
CREATE POLICY "anon_device_insert_businesses" ON businesses FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_device_update_businesses" ON businesses FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Users (no password_hash required from clients; app strips it)
CREATE POLICY "anon_device_select_users" ON users FOR SELECT TO anon USING (true);
CREATE POLICY "anon_device_insert_users" ON users FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_device_update_users" ON users FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Categories
CREATE POLICY "anon_device_select_categories" ON categories FOR SELECT TO anon USING (true);
CREATE POLICY "anon_device_insert_categories" ON categories FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_device_update_categories" ON categories FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_device_delete_categories" ON categories FOR DELETE TO anon USING (true);

-- Products
CREATE POLICY "anon_device_select_products" ON products FOR SELECT TO anon USING (true);
CREATE POLICY "anon_device_insert_products" ON products FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_device_update_products" ON products FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_device_delete_products" ON products FOR DELETE TO anon USING (true);

-- Suppliers
CREATE POLICY "anon_device_select_suppliers" ON suppliers FOR SELECT TO anon USING (true);
CREATE POLICY "anon_device_insert_suppliers" ON suppliers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_device_update_suppliers" ON suppliers FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_device_delete_suppliers" ON suppliers FOR DELETE TO anon USING (true);

-- Customers
CREATE POLICY "anon_device_select_customers" ON customers FOR SELECT TO anon USING (true);
CREATE POLICY "anon_device_insert_customers" ON customers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_device_update_customers" ON customers FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_device_delete_customers" ON customers FOR DELETE TO anon USING (true);

-- Stock movements
CREATE POLICY "anon_device_select_stock_movements" ON stock_movements FOR SELECT TO anon USING (true);
CREATE POLICY "anon_device_insert_stock_movements" ON stock_movements FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_device_update_stock_movements" ON stock_movements FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_device_delete_stock_movements" ON stock_movements FOR DELETE TO anon USING (true);

-- Purchases
CREATE POLICY "anon_device_select_purchases" ON purchases FOR SELECT TO anon USING (true);
CREATE POLICY "anon_device_insert_purchases" ON purchases FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_device_update_purchases" ON purchases FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_device_delete_purchases" ON purchases FOR DELETE TO anon USING (true);

-- Purchase items
CREATE POLICY "anon_device_select_purchase_items" ON purchase_items FOR SELECT TO anon USING (true);
CREATE POLICY "anon_device_insert_purchase_items" ON purchase_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_device_update_purchase_items" ON purchase_items FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_device_delete_purchase_items" ON purchase_items FOR DELETE TO anon USING (true);

-- Sales
CREATE POLICY "anon_device_select_sales" ON sales FOR SELECT TO anon USING (true);
CREATE POLICY "anon_device_insert_sales" ON sales FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_device_update_sales" ON sales FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_device_delete_sales" ON sales FOR DELETE TO anon USING (true);

-- Sale items
CREATE POLICY "anon_device_select_sale_items" ON sale_items FOR SELECT TO anon USING (true);
CREATE POLICY "anon_device_insert_sale_items" ON sale_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_device_update_sale_items" ON sale_items FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_device_delete_sale_items" ON sale_items FOR DELETE TO anon USING (true);

-- Expenses
CREATE POLICY "anon_device_select_expenses" ON expenses FOR SELECT TO anon USING (true);
CREATE POLICY "anon_device_insert_expenses" ON expenses FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_device_update_expenses" ON expenses FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_device_delete_expenses" ON expenses FOR DELETE TO anon USING (true);

-- Payments
CREATE POLICY "anon_device_select_payments" ON payments FOR SELECT TO anon USING (true);
CREATE POLICY "anon_device_insert_payments" ON payments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_device_update_payments" ON payments FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_device_delete_payments" ON payments FOR DELETE TO anon USING (true);

-- Daily closings
CREATE POLICY "anon_device_select_daily_closings" ON daily_closings FOR SELECT TO anon USING (true);
CREATE POLICY "anon_device_insert_daily_closings" ON daily_closings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_device_update_daily_closings" ON daily_closings FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_device_delete_daily_closings" ON daily_closings FOR DELETE TO anon USING (true);

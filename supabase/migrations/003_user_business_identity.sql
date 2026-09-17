-- User → Business identity model
-- Allows accounts without a business, unique emails, and ownership attachment

ALTER TABLE users
  ALTER COLUMN business_id DROP NOT NULL;

ALTER TABLE users
  ALTER COLUMN role DROP NOT NULL;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IS NULL OR role IN ('OWNER', 'MANAGER', 'CASHIER', 'STAFF'));

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_business_id_fkey;

ALTER TABLE users
  ADD CONSTRAINT users_business_id_fkey
  FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE SET NULL;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_business_id_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email));

-- Optional local-auth hash column (Supabase Auth is preferred in production)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Allow authenticated users without a business to create one
CREATE POLICY "Authenticated users can create a business" ON businesses
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow a user to attach themselves as OWNER when they have no business yet
CREATE POLICY "Users can claim ownership of a new business" ON users
  FOR INSERT
  WITH CHECK (
    id = auth.uid()
    AND (
      business_id IS NULL
      OR (
        role = 'OWNER'
        AND business_id IS NOT NULL
      )
    )
  );

CREATE POLICY "Users can attach to a business when unassigned" ON users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND (
      business_id IS NULL
      OR business_id = get_current_business_id()
      OR (
        -- first attachment: previous business_id was null
        (SELECT business_id FROM users WHERE id = auth.uid()) IS NULL
      )
    )
  );

-- Owners can insert staff memberships for their business
CREATE POLICY "Owners can add business users" ON users
  FOR INSERT
  WITH CHECK (
    business_id = get_current_business_id()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role = 'OWNER'
        AND business_id = get_current_business_id()
    )
  );

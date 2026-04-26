/*
  # Simplify products RLS policies
  
  1. Remove duplicated and conflicting policies
  2. Keep only essential SELECT policy for waiter/staff access
  3. Ensure product visibility works correctly with branch filtering
*/

-- Drop all conflicting policies first
DROP POLICY IF EXISTS "Branch aware product view" ON products;
DROP POLICY IF EXISTS "Users can view own tenant products" ON products;
DROP POLICY IF EXISTS "Owners and managers can delete products" ON products;
DROP POLICY IF EXISTS "Owners and managers can insert products" ON products;
DROP POLICY IF EXISTS "Owners and managers can update products" ON products;

-- Keep only the necessary ones
-- SELECT: All authenticated users in tenant can view products
CREATE POLICY "Tenant users can view products"
  ON products FOR SELECT
  TO authenticated
  USING (
    tenant_id = (
      SELECT tenant_id FROM profiles 
      WHERE id = auth.uid()
    )
  );

-- INSERT: Owner and admins only
CREATE POLICY "Admin can insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.tenant_id = products.tenant_id
      AND p.role IN ('owner', 'admin')
    )
  );

-- UPDATE: Owner and admins only
CREATE POLICY "Admin can update products"
  ON products FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.tenant_id = products.tenant_id
      AND p.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.tenant_id = products.tenant_id
      AND p.role IN ('owner', 'admin')
    )
  );

-- DELETE: Owner and admins only
CREATE POLICY "Admin can delete products"
  ON products FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.tenant_id = products.tenant_id
      AND p.role IN ('owner', 'admin')
    )
  );
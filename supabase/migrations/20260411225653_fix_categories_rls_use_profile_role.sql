/*
  # Fix categories RLS policy

  ## Problem
  The existing RLS policy for categories checks roles.name = 'owner' or 'manager',
  but the roles table uses Turkish names (Yönetici, Garson, etc.).
  The profiles table has a direct 'role' text column with values like 'owner', 'manager', 'waiter'.

  ## Fix
  Replace the broken policy with one that uses profiles.role directly.

  ## Changes
  - Drop existing broken ALL policy on categories
  - Create separate INSERT, UPDATE, DELETE policies using profiles.role column
*/

DROP POLICY IF EXISTS "Owners and managers can manage categories" ON categories;

CREATE POLICY "Owners and managers can insert categories"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = categories.tenant_id
        AND p.role IN ('owner', 'manager')
    )
  );

CREATE POLICY "Owners and managers can update categories"
  ON categories FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = categories.tenant_id
        AND p.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = categories.tenant_id
        AND p.role IN ('owner', 'manager')
    )
  );

CREATE POLICY "Owners and managers can delete categories"
  ON categories FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = categories.tenant_id
        AND p.role IN ('owner', 'manager')
    )
  );

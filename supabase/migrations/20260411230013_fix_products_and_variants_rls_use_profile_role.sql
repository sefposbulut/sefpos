/*
  # Fix products and product_variants RLS policies

  ## Problem
  Same issue as categories: policies check roles.name = 'owner'/'manager' (English)
  but roles table has Turkish names. profiles.role column has the correct English values.

  ## Changes
  - Drop broken ALL policy on products, replace with separate INSERT/UPDATE/DELETE using profiles.role
  - Drop broken UPDATE/DELETE policies on product_variants, replace with profiles.role check
*/

-- Fix products
DROP POLICY IF EXISTS "Owners and managers can manage products" ON products;

CREATE POLICY "Owners and managers can insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = products.tenant_id
        AND p.role IN ('owner', 'manager')
    )
  );

CREATE POLICY "Owners and managers can update products"
  ON products FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = products.tenant_id
        AND p.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = products.tenant_id
        AND p.role IN ('owner', 'manager')
    )
  );

CREATE POLICY "Owners and managers can delete products"
  ON products FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = products.tenant_id
        AND p.role IN ('owner', 'manager')
    )
  );

-- Fix product_variants
DROP POLICY IF EXISTS "Users with product permission can insert variants" ON product_variants;
DROP POLICY IF EXISTS "Users with product permission can update variants" ON product_variants;
DROP POLICY IF EXISTS "Users with product permission can delete variants" ON product_variants;

CREATE POLICY "Owners and managers can insert variants"
  ON product_variants FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = product_variants.tenant_id
        AND p.role IN ('owner', 'manager')
    )
  );

CREATE POLICY "Owners and managers can update variants"
  ON product_variants FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = product_variants.tenant_id
        AND p.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = product_variants.tenant_id
        AND p.role IN ('owner', 'manager')
    )
  );

CREATE POLICY "Owners and managers can delete variants"
  ON product_variants FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = product_variants.tenant_id
        AND p.role IN ('owner', 'manager')
    )
  );

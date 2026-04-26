/*
  # Add Product Variants Support

  1. New Tables
    - `product_variants`
      - `id` (uuid, primary key)
      - `tenant_id` (uuid, foreign key to tenants)
      - `product_id` (uuid, foreign key to products)
      - `name` (text) - variant name like "Küçük", "Orta", "Büyük"
      - `price_modifier` (decimal) - price adjustment for this variant
      - `sort_order` (integer) - display order
      - `is_active` (boolean)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Changes
    - Add `variant_id` column to `order_items` table to track which variant was ordered
    - Add `variant_name` column to store variant name for historical record
    - Add foreign key constraints

  3. Security
    - Enable RLS on `product_variants` table
    - Add policies for authenticated users to read variants
    - Add policies for users with product management permission to manage variants

  4. Important Notes
    - Variants allow same product to have different sizes/options with price adjustments
    - When ordering, users can select a variant which modifies the base product price
    - Each order item can optionally reference a variant
    - Variant name is stored in order_items for historical accuracy even if variant is deleted
*/

-- Create product_variants table
CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_modifier decimal(10,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add variant_id to order_items if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_items' AND column_name = 'variant_id'
  ) THEN
    ALTER TABLE order_items ADD COLUMN variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_items' AND column_name = 'variant_name'
  ) THEN
    ALTER TABLE order_items ADD COLUMN variant_name text;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

-- Policies for product_variants
CREATE POLICY "Users can view variants in their tenant"
  ON product_variants FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users with product permission can insert variants"
  ON product_variants FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT p.tenant_id 
      FROM profiles p
      LEFT JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() 
      AND (r.permissions->>'can_manage_products')::boolean = true
    )
  );

CREATE POLICY "Users with product permission can update variants"
  ON product_variants FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT p.tenant_id 
      FROM profiles p
      LEFT JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() 
      AND (r.permissions->>'can_manage_products')::boolean = true
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT p.tenant_id 
      FROM profiles p
      LEFT JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() 
      AND (r.permissions->>'can_manage_products')::boolean = true
    )
  );

CREATE POLICY "Users with product permission can delete variants"
  ON product_variants FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT p.tenant_id 
      FROM profiles p
      LEFT JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() 
      AND (r.permissions->>'can_manage_products')::boolean = true
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_product_variants_tenant ON product_variants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant ON order_items(variant_id);

-- Enable realtime for product_variants
ALTER PUBLICATION supabase_realtime ADD TABLE product_variants;
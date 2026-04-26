/*
  # Add scale_enabled field to products table

  1. New Columns
    - `scale_enabled` (boolean, default false)
      - When true, this product requires scale weight measurement
      - Used for CAS ERJ and similar computer-connected scales
  
  2. Changes
    - Add scale_enabled column to products table
    - Add index for faster filtering

  3. Notes
    - Backward compatible - default false means existing products unaffected
    - When enabled, users must weigh item on scale before adding to cart
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'scale_enabled'
  ) THEN
    ALTER TABLE products ADD COLUMN scale_enabled boolean DEFAULT false;
    CREATE INDEX idx_products_scale_enabled ON products(scale_enabled) WHERE tenant_id IS NOT NULL;
  END IF;
END $$;

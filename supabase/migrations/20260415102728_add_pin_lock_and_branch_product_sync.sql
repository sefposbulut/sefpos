/*
  # PIN Lock and Branch Product Sync

  1. Changes
    - Adds `lock_pin` column to `tenants` table (nullable text, 4-6 digit PIN for screen lock)
    - Adds `use_central_products` column to `branches` table (boolean, default true)
      - When true: branch uses the central/main product catalog
      - When false: branch manages its own products independently

  2. Security
    - No RLS changes needed - these columns are accessed through existing tenant/branch policies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'lock_pin'
  ) THEN
    ALTER TABLE tenants ADD COLUMN lock_pin text DEFAULT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'branches' AND column_name = 'use_central_products'
  ) THEN
    ALTER TABLE branches ADD COLUMN use_central_products boolean DEFAULT true;
  END IF;
END $$;

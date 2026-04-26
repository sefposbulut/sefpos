/*
  # Add complimentary fields to order_items table

  1. New Columns
    - `is_complimentary` (boolean, default false) - Mark if item is complimentary
    - `complimentary_note` (text, nullable) - Optional note for why item is complimentary
  
  2. Details
    - These fields allow marking individual order items as complimentary/free items
    - Complimentary items are included in payment calculations but marked separately
    - Notes help track reason for complimentary items (promotional, damage replacement, etc.)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_items' AND column_name = 'is_complimentary'
  ) THEN
    ALTER TABLE order_items ADD COLUMN is_complimentary BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'order_items' AND column_name = 'complimentary_note'
  ) THEN
    ALTER TABLE order_items ADD COLUMN complimentary_note TEXT;
  END IF;
END $$;

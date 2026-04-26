/*
  # Add payment_collected field to orders

  ## Summary
  Adds a boolean field to track whether payment has already been collected
  (e.g., paid online or in advance) vs to be collected at delivery/pickup.

  ## Changes
  - `orders` table: add `payment_collected` boolean column (default false)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'payment_collected'
  ) THEN
    ALTER TABLE orders ADD COLUMN payment_collected boolean NOT NULL DEFAULT false;
  END IF;
END $$;

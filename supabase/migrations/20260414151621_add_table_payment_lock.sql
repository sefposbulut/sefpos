/*
  # Add payment lock to restaurant_tables

  ## Summary
  Adds a `payment_locked` boolean column to `restaurant_tables` to prevent
  concurrent access when a cashier is processing payment on a table.

  ## Changes
  - `restaurant_tables`: new column `payment_locked` (boolean, default false)
    - When true, the table is locked for payment processing
    - Other users cannot open the order panel for this table while locked

  ## Notes
  - Lock is set when payment modal opens
  - Lock is cleared when payment completes or modal is closed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'restaurant_tables' AND column_name = 'payment_locked'
  ) THEN
    ALTER TABLE restaurant_tables ADD COLUMN payment_locked boolean DEFAULT false;
  END IF;
END $$;

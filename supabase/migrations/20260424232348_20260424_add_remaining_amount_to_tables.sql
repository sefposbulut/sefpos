/*
  # Add remaining amount to tables

  1. New Column
    - `remaining_amount` on `restaurant_tables` table
      - Stores the unpaid amount for partial payments
      - Default: 0
      - Used to display outstanding balance on table

  2. Purpose
    - Track partial payments on tables
    - Display remaining balance when table has unpaid amount
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'restaurant_tables' AND column_name = 'remaining_amount'
  ) THEN
    ALTER TABLE restaurant_tables ADD COLUMN remaining_amount NUMERIC(10,2) DEFAULT 0;
  END IF;
END $$;
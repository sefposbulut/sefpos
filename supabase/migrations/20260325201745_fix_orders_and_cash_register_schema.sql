/*
  # Fix Orders and Cash Register Schema Issues
  
  1. Changes
    - Add paid_at column to orders table
    - Add foreign key relationship from cash_register_transactions.created_by to profiles.id
  
  2. Security
    - Maintains existing RLS policies
*/

-- Add paid_at column to orders if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'paid_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN paid_at timestamptz;
  END IF;
END $$;

-- Drop the existing foreign key constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'cash_register_transactions_created_by_fkey'
    AND table_name = 'cash_register_transactions'
  ) THEN
    ALTER TABLE cash_register_transactions DROP CONSTRAINT cash_register_transactions_created_by_fkey;
  END IF;
END $$;

-- Add foreign key from cash_register_transactions.created_by to profiles.id
ALTER TABLE cash_register_transactions 
  ADD CONSTRAINT cash_register_transactions_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES profiles(id);

/*
  # Add Order Type and Improvements to Orders Table
  
  1. Changes
    - Add `order_type` column to orders table (dine_in, takeaway, delivery)
    - Add `order_number` auto-generation trigger
    - Make order_number nullable initially (will be auto-generated)
    - Add status values for active/pending/completed/cancelled
    
  2. Security
    - Maintains existing RLS policies
*/

-- Add order_type column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'order_type'
  ) THEN
    ALTER TABLE orders ADD COLUMN order_type text DEFAULT 'dine_in' CHECK (order_type IN ('dine_in', 'takeaway', 'delivery'));
  END IF;
END $$;

-- Drop the NOT NULL constraint on order_number if it exists
ALTER TABLE orders ALTER COLUMN order_number DROP NOT NULL;

-- Create sequence for order numbers if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'order_number_seq') THEN
    CREATE SEQUENCE order_number_seq START 1;
  END IF;
END $$;

-- Create or replace function to generate order numbers
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    IF NEW.order_type = 'takeaway' THEN
      NEW.order_number := 'PAKET-' || LPAD(nextval('order_number_seq')::text, 6, '0');
    ELSIF NEW.order_type = 'delivery' THEN
      NEW.order_number := 'GELAL-' || LPAD(nextval('order_number_seq')::text, 6, '0');
    ELSE
      NEW.order_number := 'SIP-' || LPAD(nextval('order_number_seq')::text, 6, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS orders_generate_number ON orders;
CREATE TRIGGER orders_generate_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_order_number();

-- Add status column modifications if needed (extend existing CHECK constraint)
DO $$
BEGIN
  -- Drop existing check constraint if exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name LIKE 'orders_status_check%' AND table_name = 'orders'
  ) THEN
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check1;
  END IF;
  
  -- Add new check constraint with all statuses
  ALTER TABLE orders ADD CONSTRAINT orders_status_check 
    CHECK (status IN ('active', 'pending', 'open', 'completed', 'cancelled'));
END $$;
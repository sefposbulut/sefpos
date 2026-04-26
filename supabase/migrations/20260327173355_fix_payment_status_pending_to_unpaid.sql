/*
  # Fix payment_status constraint to include 'pending'

  1. Changes
    - Alter the check constraint on orders table to accept 'pending' as a valid payment_status
    - This allows orders to be created with 'pending' status before payment is processed
  
  2. Security
    - No RLS changes needed
*/

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;

ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check 
  CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'pending'));

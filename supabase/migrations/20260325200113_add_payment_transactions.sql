/*
  # Add Payment Transactions System

  1. New Tables
    - `payment_transactions`
      - `id` (uuid, primary key)
      - `tenant_id` (uuid, references tenants)
      - `order_id` (uuid, references orders)
      - `payment_method` (text: cash, credit_card, open_account)
      - `amount` (numeric)
      - `created_at` (timestamptz)
      - `created_by` (uuid, references auth.users)

  2. Changes
    - Update orders table to support partial payments
    - Track multiple payment transactions per order

  3. Security
    - Enable RLS on payment_transactions
    - Add policies for authenticated users to manage payments
*/

-- Create payment_transactions table
CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'credit_card', 'open_account')),
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- Policies for payment_transactions
CREATE POLICY "Users can view own tenant payment transactions"
  ON payment_transactions
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create payment transactions"
  ON payment_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update own tenant payment transactions"
  ON payment_transactions
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own tenant payment transactions"
  ON payment_transactions
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id ON payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_tenant_id ON payment_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at ON payment_transactions(created_at DESC);

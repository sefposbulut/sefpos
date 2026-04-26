/*
  # Create Cash Register Transactions System

  1. New Tables
    - `cash_register_transactions`
      - `id` (uuid, primary key) - Unique transaction ID
      - `tenant_id` (uuid, references tenants) - Restaurant/business
      - `transaction_type` (text) - Type: order_payment, refund, expense, cash_in, cash_out, opening_balance, closing_balance
      - `payment_method` (text) - Method: cash, credit_card, open_account
      - `amount` (numeric) - Transaction amount
      - `reference_id` (uuid, nullable) - Links to order, payment, etc.
      - `reference_type` (text, nullable) - Type of reference: order, payment_transaction, etc.
      - `description` (text) - Transaction description
      - `order_number` (text, nullable) - Order reference number
      - `table_name` (text, nullable) - Table name if applicable
      - `created_at` (timestamptz) - Transaction timestamp
      - `created_by` (uuid, references auth.users) - User who performed transaction
      - `shift_id` (uuid, nullable) - For future shift management

  2. Changes
    - Automatically log all payment transactions to cash register
    - Track all money movements in the system
    - Full audit trail with user information

  3. Security
    - Enable RLS on cash_register_transactions
    - Add policies for authenticated users to view and manage transactions
*/

-- Create cash_register_transactions table
CREATE TABLE IF NOT EXISTS cash_register_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('order_payment', 'refund', 'expense', 'cash_in', 'cash_out', 'opening_balance', 'closing_balance')),
  payment_method text CHECK (payment_method IN ('cash', 'credit_card', 'open_account')),
  amount numeric(10,2) NOT NULL,
  reference_id uuid,
  reference_type text CHECK (reference_type IN ('order', 'payment_transaction', 'expense', 'other')),
  description text NOT NULL,
  order_number text,
  table_name text,
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  shift_id uuid
);

-- Enable RLS
ALTER TABLE cash_register_transactions ENABLE ROW LEVEL SECURITY;

-- Policies for cash_register_transactions
CREATE POLICY "Users can view own tenant cash register transactions"
  ON cash_register_transactions
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create cash register transactions"
  ON cash_register_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update own tenant cash register transactions"
  ON cash_register_transactions
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own tenant cash register transactions"
  ON cash_register_transactions
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_cash_register_tenant_id ON cash_register_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cash_register_created_at ON cash_register_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_register_transaction_type ON cash_register_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_cash_register_payment_method ON cash_register_transactions(payment_method);
CREATE INDEX IF NOT EXISTS idx_cash_register_created_by ON cash_register_transactions(created_by);

-- Create function to automatically log payment transactions to cash register
CREATE OR REPLACE FUNCTION log_payment_to_cash_register()
RETURNS TRIGGER AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_table restaurant_tables%ROWTYPE;
BEGIN
  -- Get order details
  SELECT * INTO v_order FROM orders WHERE id = NEW.order_id;
  
  -- Get table details if exists
  IF v_order.table_id IS NOT NULL THEN
    SELECT * INTO v_table FROM restaurant_tables WHERE id = v_order.table_id;
  END IF;

  -- Insert into cash register
  INSERT INTO cash_register_transactions (
    tenant_id,
    transaction_type,
    payment_method,
    amount,
    reference_id,
    reference_type,
    description,
    order_number,
    table_name,
    created_at,
    created_by
  ) VALUES (
    NEW.tenant_id,
    'order_payment',
    NEW.payment_method,
    NEW.amount,
    NEW.id,
    'payment_transaction',
    CASE 
      WHEN NEW.payment_method = 'cash' THEN 'Nakit Ödeme'
      WHEN NEW.payment_method = 'credit_card' THEN 'Kredi Kartı Ödemesi'
      WHEN NEW.payment_method = 'open_account' THEN 'Açık Hesap Ödemesi'
    END,
    v_order.id::text,
    v_table.name,
    NEW.created_at,
    NEW.created_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically log payments
DROP TRIGGER IF EXISTS trigger_log_payment_to_cash_register ON payment_transactions;
CREATE TRIGGER trigger_log_payment_to_cash_register
  AFTER INSERT ON payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION log_payment_to_cash_register();

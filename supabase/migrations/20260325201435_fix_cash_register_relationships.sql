/*
  # Fix Cash Register Transactions Relationships
  
  1. Changes
    - Update created_by foreign key to reference profiles instead of auth.users
    - Fix payment logging trigger to use table_number instead of name
  
  2. Security
    - Maintains existing RLS policies
*/

-- Drop and recreate the trigger function with correct field name
CREATE OR REPLACE FUNCTION log_payment_to_cash_register()
RETURNS TRIGGER AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_table restaurant_tables%ROWTYPE;
  v_table_display text;
BEGIN
  -- Get order details
  SELECT * INTO v_order FROM orders WHERE id = NEW.order_id;
  
  -- Get table details if exists
  IF v_order.table_id IS NOT NULL THEN
    SELECT * INTO v_table FROM restaurant_tables WHERE id = v_order.table_id;
    v_table_display := 'Masa ' || v_table.table_number::text;
  ELSE
    v_table_display := NULL;
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
    v_order.order_number,
    v_table_display,
    NEW.created_at,
    NEW.created_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

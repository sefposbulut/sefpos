/*
  # Enhanced Payment System with Customers & Credit
  
  Tables and fields for multi-part payment handling and customer tracking.
*/

DO $$
BEGIN
  -- Create payment_split_transactions table
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_split_transactions') THEN
    CREATE TABLE payment_split_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      payment_transaction_id UUID NOT NULL REFERENCES payment_transactions(id) ON DELETE CASCADE,
      plan_type TEXT NOT NULL CHECK (plan_type IN ('cash', 'partial', 'credit')),
      amount NUMERIC(12,2) NOT NULL,
      payment_method TEXT NOT NULL,
      customer_id UUID,
      customer_name TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    ALTER TABLE payment_split_transactions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Tenant users can view split transactions"
      ON payment_split_transactions FOR SELECT
      TO authenticated
      USING (tenant_id = (auth.jwt()->>'tenant_id')::UUID);
    CREATE POLICY "Tenant users can insert split transactions"
      ON payment_split_transactions FOR INSERT
      TO authenticated
      WITH CHECK (tenant_id = (auth.jwt()->>'tenant_id')::UUID);
  END IF;

  -- Create order_customers table
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_customers') THEN
    CREATE TABLE order_customers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      customer_id UUID,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      credit_used NUMERIC(12,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(order_id)
    );
    ALTER TABLE order_customers ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Tenant users can view order customers"
      ON order_customers FOR SELECT
      TO authenticated
      USING (tenant_id = (auth.jwt()->>'tenant_id')::UUID);
    CREATE POLICY "Tenant users can insert order customers"
      ON order_customers FOR INSERT
      TO authenticated
      WITH CHECK (tenant_id = (auth.jwt()->>'tenant_id')::UUID);
    CREATE POLICY "Tenant users can update order customers"
      ON order_customers FOR UPDATE
      TO authenticated
      USING (tenant_id = (auth.jwt()->>'tenant_id')::UUID)
      WITH CHECK (tenant_id = (auth.jwt()->>'tenant_id')::UUID);
  END IF;

  -- Add fields to payment_transactions
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_transactions' AND column_name = 'payment_plan_type'
  ) THEN
    ALTER TABLE payment_transactions ADD COLUMN payment_plan_type TEXT DEFAULT 'full';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_transactions' AND column_name = 'customer_id'
  ) THEN
    ALTER TABLE payment_transactions ADD COLUMN customer_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payment_transactions' AND column_name = 'remaining_amount'
  ) THEN
    ALTER TABLE payment_transactions ADD COLUMN remaining_amount NUMERIC(12,2);
  END IF;

  -- Add fields to orders
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'discount_percent'
  ) THEN
    ALTER TABLE orders ADD COLUMN discount_percent NUMERIC(5,2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'discount_reason'
  ) THEN
    ALTER TABLE orders ADD COLUMN discount_reason TEXT;
  END IF;

END $$;
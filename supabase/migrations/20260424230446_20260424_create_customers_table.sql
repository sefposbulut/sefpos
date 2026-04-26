/*
  # Create Customers Table
  
  1. New Tables
    - `customers` - Store customer information with credit balance
  
  2. Security
    - RLS enabled on customers table
    - Users can only see/edit customers from their tenant
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
    CREATE TABLE customers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      credit_balance NUMERIC(12,2) DEFAULT 0,
      total_credit_given NUMERIC(12,2) DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    
    ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
    
    CREATE POLICY "Tenant users can view customers"
      ON customers FOR SELECT
      TO authenticated
      USING (tenant_id = (auth.jwt()->>'tenant_id')::UUID);
    
    CREATE POLICY "Tenant users can insert customers"
      ON customers FOR INSERT
      TO authenticated
      WITH CHECK (tenant_id = (auth.jwt()->>'tenant_id')::UUID);
    
    CREATE POLICY "Tenant users can update customers"
      ON customers FOR UPDATE
      TO authenticated
      USING (tenant_id = (auth.jwt()->>'tenant_id')::UUID)
      WITH CHECK (tenant_id = (auth.jwt()->>'tenant_id')::UUID);
    
    CREATE INDEX idx_customers_tenant ON customers(tenant_id);
    CREATE INDEX idx_customers_active ON customers(is_active) WHERE is_active = true;
  END IF;
END $$;
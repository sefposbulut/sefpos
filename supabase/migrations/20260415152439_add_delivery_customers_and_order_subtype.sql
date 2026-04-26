/*
  # Add delivery_customers table and order_subtype column

  ## New Tables
  - `delivery_customers`: Stores customer info for takeaway/delivery orders
    - phone-based lookup within a tenant
    - tracks order history and last order time

  ## Orders Table Updates
  - `order_subtype`: 'takeaway' or 'gel_al' to distinguish pickup types
  - `delivery_customer_id`: FK to delivery_customers

  ## Security
  - Full RLS on delivery_customers (tenant-isolated)
*/

-- delivery_customers table
CREATE TABLE IF NOT EXISTS delivery_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  full_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  address text DEFAULT '',
  notes text DEFAULT '',
  last_order_at timestamptz,
  order_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_customers_tenant_phone_uidx
  ON delivery_customers(tenant_id, phone)
  WHERE phone != '';

CREATE INDEX IF NOT EXISTS delivery_customers_tenant_id_idx ON delivery_customers(tenant_id);
CREATE INDEX IF NOT EXISTS delivery_customers_phone_idx ON delivery_customers(phone);

ALTER TABLE delivery_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can read delivery customers"
  ON delivery_customers FOR SELECT
  TO authenticated
  USING (tenant_id = get_my_tenant_id_direct());

CREATE POLICY "Tenant members can insert delivery customers"
  ON delivery_customers FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id_direct());

CREATE POLICY "Tenant members can update delivery customers"
  ON delivery_customers FOR UPDATE
  TO authenticated
  USING (tenant_id = get_my_tenant_id_direct())
  WITH CHECK (tenant_id = get_my_tenant_id_direct());

CREATE POLICY "Tenant members can delete delivery customers"
  ON delivery_customers FOR DELETE
  TO authenticated
  USING (tenant_id = get_my_tenant_id_direct());

-- Add missing columns to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_subtype text DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_customer_id uuid REFERENCES delivery_customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_delivery_customer_id_idx ON orders(delivery_customer_id) WHERE delivery_customer_id IS NOT NULL;

-- Add delivery_customers to realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE delivery_customers;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

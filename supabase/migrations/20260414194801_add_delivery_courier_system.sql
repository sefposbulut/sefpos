/*
  # Delivery & Courier System

  ## Summary
  Tam teşekküllü kurye ve paket servis yönetim sistemi.

  ## New Tables
  - `couriers` - Kurye/paket servis çalışanları
    - id, tenant_id, branch_id
    - full_name, phone
    - status: 'available' | 'busy' | 'offline'
    - is_active
    - created_at

  ## Modified Tables
  - `orders`
    - `customer_name` (text) - Paket/teslimat müşteri adı
    - `customer_phone` (text) - Müşteri telefonu
    - `delivery_address` (text) - Teslimat adresi
    - `delivery_note` (text) - Teslimat notu
    - `courier_id` (uuid FK) - Atanan kurye
    - `courier_name` (text) - Kurye adı snapshot
    - `delivery_status` (text) - 'pending' | 'assigned' | 'picked_up' | 'delivered' | 'failed'
    - `assigned_at` (timestamptz) - Kurye atanma zamanı
    - `picked_up_at` (timestamptz) - Kurye teslim aldı
    - `delivered_at` (timestamptz) - Teslim edildi
    - `estimated_delivery_minutes` (int) - Tahmini teslimat dakikası

  ## Security
  - RLS enabled on couriers table
  - Tenant-isolated policies
*/

-- Couriers table
CREATE TABLE IF NOT EXISTS couriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  phone text DEFAULT '',
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'busy', 'offline')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE couriers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view couriers"
  ON couriers FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Tenant admins can insert couriers"
  ON couriers FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Tenant admins can update couriers"
  ON couriers FOR UPDATE
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Tenant admins can delete couriers"
  ON couriers FOR DELETE
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- Add delivery columns to orders
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'customer_name') THEN
    ALTER TABLE orders ADD COLUMN customer_name text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'customer_phone') THEN
    ALTER TABLE orders ADD COLUMN customer_phone text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'delivery_address') THEN
    ALTER TABLE orders ADD COLUMN delivery_address text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'delivery_note') THEN
    ALTER TABLE orders ADD COLUMN delivery_note text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'courier_id') THEN
    ALTER TABLE orders ADD COLUMN courier_id uuid REFERENCES couriers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'courier_name') THEN
    ALTER TABLE orders ADD COLUMN courier_name text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'delivery_status') THEN
    ALTER TABLE orders ADD COLUMN delivery_status text DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'assigned', 'picked_up', 'delivered', 'failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'assigned_at') THEN
    ALTER TABLE orders ADD COLUMN assigned_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'picked_up_at') THEN
    ALTER TABLE orders ADD COLUMN picked_up_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'delivered_at') THEN
    ALTER TABLE orders ADD COLUMN delivered_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'estimated_delivery_minutes') THEN
    ALTER TABLE orders ADD COLUMN estimated_delivery_minutes integer DEFAULT 30;
  END IF;
END $$;

-- Enable realtime for couriers
ALTER PUBLICATION supabase_realtime ADD TABLE couriers;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_couriers_tenant ON couriers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_courier ON orders(courier_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_status ON orders(delivery_status);
CREATE INDEX IF NOT EXISTS idx_orders_order_type ON orders(order_type);

/*
  # Online Orders System for Third-Party Delivery Platforms
  
  1. New Tables
    - `online_order_platforms`
      - Platform information (Yemeksepeti, Getir Yemek, etc.)
      - API credentials and webhook settings
    
    - `online_orders`
      - Orders from delivery platforms
      - Customer info, delivery address, platform order ID
      - Status tracking (new, accepted, preparing, ready, delivered)
      - Integration with main orders table
    
    - `online_order_items`
      - Items in online orders
      - Product mapping to internal products
  
  2. Security
    - Enable RLS on all tables
    - Policies for authenticated users to view/manage orders
    - Webhook access without authentication (public endpoint)
  
  3. Features
    - Real-time order notifications
    - Order status synchronization
    - Platform commission tracking
*/

-- Online Order Platforms (Yemeksepeti, Getir, etc.)
CREATE TABLE IF NOT EXISTS online_order_platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform_name text NOT NULL,
  platform_code text NOT NULL,
  is_active boolean DEFAULT true,
  webhook_url text,
  api_key text,
  commission_rate numeric(5,2) DEFAULT 0,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, platform_code)
);

-- Online Orders from delivery platforms
CREATE TABLE IF NOT EXISTS online_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform_id uuid NOT NULL REFERENCES online_order_platforms(id) ON DELETE CASCADE,
  platform_order_id text NOT NULL,
  platform_order_number text,
  
  -- Order status
  status text NOT NULL DEFAULT 'new',
  payment_status text DEFAULT 'paid',
  
  -- Customer information
  customer_name text NOT NULL,
  customer_phone text,
  customer_address text,
  customer_notes text,
  
  -- Order details
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  delivery_fee numeric(10,2) DEFAULT 0,
  platform_commission numeric(10,2) DEFAULT 0,
  tax_amount numeric(10,2) DEFAULT 0,
  discount_amount numeric(10,2) DEFAULT 0,
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  
  -- Delivery info
  estimated_delivery_time timestamptz,
  delivery_address_lat numeric(10,7),
  delivery_address_lng numeric(10,7),
  
  -- Internal order reference
  internal_order_id uuid REFERENCES orders(id),
  
  -- Timestamps
  platform_created_at timestamptz,
  accepted_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  created_by uuid REFERENCES auth.users(id),
  
  UNIQUE(tenant_id, platform_id, platform_order_id)
);

-- Online Order Items
CREATE TABLE IF NOT EXISTS online_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  online_order_id uuid NOT NULL REFERENCES online_orders(id) ON DELETE CASCADE,
  
  -- Product mapping
  product_id uuid REFERENCES products(id),
  variant_id uuid REFERENCES product_variants(id),
  
  -- Platform product info (in case no mapping exists)
  platform_product_name text NOT NULL,
  platform_product_code text,
  
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL,
  tax_rate numeric(5,2) DEFAULT 0,
  discount_amount numeric(10,2) DEFAULT 0,
  total_amount numeric(10,2) NOT NULL,
  
  notes text,
  special_instructions text,
  
  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_online_orders_tenant ON online_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_online_orders_platform ON online_orders(platform_id);
CREATE INDEX IF NOT EXISTS idx_online_orders_status ON online_orders(status);
CREATE INDEX IF NOT EXISTS idx_online_orders_created ON online_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_online_order_items_order ON online_order_items(online_order_id);

-- Enable Row Level Security
ALTER TABLE online_order_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_order_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for online_order_platforms
CREATE POLICY "Users can view own tenant platforms"
  ON online_order_platforms FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage platforms"
  ON online_order_platforms FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT p.tenant_id FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.permissions->>'can_manage_settings' = 'true'
    )
  );

-- RLS Policies for online_orders
CREATE POLICY "Users can view own tenant orders"
  ON online_orders FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update orders"
  ON online_orders FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create orders"
  ON online_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS Policies for online_order_items
CREATE POLICY "Users can view own tenant order items"
  ON online_order_items FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can manage order items"
  ON online_order_items FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Insert default platforms for new tenants
DO $$
BEGIN
  -- We'll let users add platforms manually or via admin panel
  -- This way they can configure their own credentials
END $$;

-- Enable realtime for online orders
ALTER PUBLICATION supabase_realtime ADD TABLE online_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE online_order_items;
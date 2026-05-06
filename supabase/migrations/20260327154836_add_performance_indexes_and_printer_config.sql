/*
  # Performance Optimization for 10000+ Restaurants

  1. Performance Indexes
    - Composite indexes on tenant_id + frequently queried columns
    - Partial indexes for active/open records only
    - Indexes on foreign keys and status fields
    - Covering indexes for common queries

  2. Printer Configuration
    - Add printer settings to tenants table
    - Support for multiple printer configurations (kitchen, bar, receipt)

  3. Query Optimization
    - Indexes designed for multi-tenant isolation
    - Fast filtering by status, date ranges, and relationships
*/

-- Add printer configuration to tenants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'tenants' AND column_name = 'printer_settings'
  ) THEN
    ALTER TABLE tenants ADD COLUMN printer_settings jsonb DEFAULT '{
      "receipt_printer": {
        "enabled": false,
        "name": "Receipt Printer",
        "width": 32,
        "encoding": "windows-1254",
        "cut_paper": true
      },
      "kitchen_printer": {
        "enabled": false,
        "name": "Kitchen Printer", 
        "width": 32,
        "encoding": "windows-1254",
        "cut_paper": true
      },
      "bar_printer": {
        "enabled": false,
        "name": "Bar Printer",
        "width": 32,
        "encoding": "windows-1254",
        "cut_paper": true
      }
    }'::jsonb;
  END IF;
END $$;

-- Compatibility guards for legacy schemas
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'products'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE products ADD COLUMN is_active boolean DEFAULT true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'orders'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'order_type'
  ) THEN
    ALTER TABLE orders ADD COLUMN order_type text DEFAULT 'dine_in';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'orders'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE orders ADD COLUMN payment_status text DEFAULT 'unpaid';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'orders'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN completed_at timestamptz;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'product_variants'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_variants' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE product_variants ADD COLUMN is_active boolean DEFAULT true;
  END IF;

  -- Legacy order_items had no tenant_id; indexes expect it
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'order_items'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE order_items ADD COLUMN tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;
    UPDATE order_items oi
    SET tenant_id = o.tenant_id
    FROM orders o
    WHERE oi.order_id = o.id;
  END IF;

  -- Legacy categories used display_order; newer code uses sort_order
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'categories'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE categories ADD COLUMN sort_order integer DEFAULT 0;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'display_order'
    ) THEN
      UPDATE categories SET sort_order = display_order;
    END IF;
  END IF;

  -- Table groups migration may be missing on some DBs
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'restaurant_tables'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'restaurant_tables' AND column_name = 'group_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'table_groups'
  ) THEN
    ALTER TABLE restaurant_tables ADD COLUMN group_id uuid REFERENCES table_groups(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Critical Performance Indexes
-- Most queries filter by tenant_id first, then by other conditions

-- Products: Fast category browsing and search
CREATE INDEX IF NOT EXISTS idx_products_tenant_category_active 
  ON products(tenant_id, category_id, is_active) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_products_tenant_name 
  ON products(tenant_id, name text_pattern_ops);

-- Orders: Most critical table for performance
-- Active orders (non-completed)
CREATE INDEX IF NOT EXISTS idx_orders_tenant_active 
  ON orders(tenant_id, status, created_at DESC) 
  WHERE status != 'completed';

-- Orders by table (for quick table status checks)
CREATE INDEX IF NOT EXISTS idx_orders_tenant_table_status 
  ON orders(tenant_id, table_id, status) 
  WHERE table_id IS NOT NULL AND status != 'completed';

-- Orders by payment status (for pending payments)
CREATE INDEX IF NOT EXISTS idx_orders_tenant_payment 
  ON orders(tenant_id, payment_status, created_at DESC) 
  WHERE payment_status != 'paid';

-- Recent completed orders (for reports)
CREATE INDEX IF NOT EXISTS idx_orders_tenant_completed 
  ON orders(tenant_id, completed_at DESC) 
  WHERE completed_at IS NOT NULL;

-- Order by type (dine-in, takeaway, delivery)
CREATE INDEX IF NOT EXISTS idx_orders_tenant_type_status 
  ON orders(tenant_id, order_type, status);

-- Order Items: Fast order details retrieval
CREATE INDEX IF NOT EXISTS idx_order_items_tenant_order 
  ON order_items(tenant_id, order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product 
  ON order_items(product_id, created_at DESC);

-- Restaurant Tables: Fast table status lookup
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_tenant_status 
  ON restaurant_tables(tenant_id, status) 
  WHERE status != 'available';

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_tenant_group 
  ON restaurant_tables(tenant_id, group_id, status);

-- Customers: optional table (legacy DBs may not have customers yet)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'customers'
  ) THEN
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone
      ON customers(tenant_id, phone text_pattern_ops)
      WHERE phone IS NOT NULL
    $idx$;
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_customers_tenant_name
      ON customers(tenant_id, name text_pattern_ops)
    $idx$;
    EXECUTE $idx$
      CREATE INDEX IF NOT EXISTS idx_customers_tenant_balance
      ON customers(tenant_id, balance)
      WHERE balance != 0
    $idx$;
  END IF;
END $$;

-- Cash Register Transactions: Fast shift reporting
CREATE INDEX IF NOT EXISTS idx_cash_transactions_shift 
  ON cash_register_transactions(tenant_id, shift_id, created_at DESC) 
  WHERE shift_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cash_transactions_tenant_date 
  ON cash_register_transactions(tenant_id, created_at DESC);

-- Payment Transactions: For financial reports
CREATE INDEX IF NOT EXISTS idx_payment_transactions_tenant_date 
  ON payment_transactions(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_order 
  ON payment_transactions(order_id);

-- Online Orders: Fast platform filtering
CREATE INDEX IF NOT EXISTS idx_online_orders_tenant_status 
  ON online_orders(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_online_orders_platform 
  ON online_orders(platform_id, status);

CREATE INDEX IF NOT EXISTS idx_online_orders_platform_id 
  ON online_orders(tenant_id, platform_order_id);

-- Online Order Items
CREATE INDEX IF NOT EXISTS idx_online_order_items_order 
  ON online_order_items(online_order_id);

-- Product Variants
CREATE INDEX IF NOT EXISTS idx_product_variants_tenant_product 
  ON product_variants(tenant_id, product_id, is_active) 
  WHERE is_active = true;

-- Profiles: Fast user lookup
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_role 
  ON profiles(tenant_id, role);

-- Categories: Fast sorting
CREATE INDEX IF NOT EXISTS idx_categories_tenant_sort 
  ON categories(tenant_id, sort_order);

-- Analyze tables for query planner
ANALYZE products;
ANALYZE orders;
ANALYZE order_items;
ANALYZE restaurant_tables;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'customers'
  ) THEN
    EXECUTE 'ANALYZE customers';
  END IF;
END $$;
ANALYZE payment_transactions;
ANALYZE cash_register_transactions;
ANALYZE online_orders;

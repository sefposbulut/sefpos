
/*
  # Performance Indexes for Speed Optimization

  Adds missing indexes for the most frequently queried patterns:
  - Active orders by table (for fast order panel opening)
  - Products filtered by active status and category
  - Barcode lookups
  - Order items for open orders (non-cancelled)
  - Payment transactions lookup
*/

CREATE INDEX IF NOT EXISTS idx_orders_table_active
  ON orders(table_id, status)
  WHERE status IN ('open', 'pending');

CREATE INDEX IF NOT EXISTS idx_products_tenant_active
  ON products(tenant_id, is_active, category_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_products_barcode
  ON products(barcode)
  WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_order_notcancelled
  ON order_items(order_id)
  WHERE cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_order
  ON payment_transactions(order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_open
  ON orders(tenant_id, status, updated_at DESC)
  WHERE status IN ('open', 'pending');

CREATE INDEX IF NOT EXISTS idx_product_variants_product_active
  ON product_variants(product_id, is_active)
  WHERE is_active = true;

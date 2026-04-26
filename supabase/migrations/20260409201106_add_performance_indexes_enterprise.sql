/*
  # Enterprise Performans Indexleri

  ## Amaç
  100+ restoran, her restoranda çok sayıda şube, milyonlarca kayıt senaryosunda
  sorgu sürelerini minimize etmek.

  ## Yeni Indexler
  - restaurant_tables: branch_id + status, current_order_id
  - orders: branch_id + status + created_at, tenant_id + order_type + status, table_id
  - order_items: order_id
  - online_orders: tenant_id + status + created_at
  - payment_transactions: order_id
  - profiles: tenant_id + branch_id
  - products: tenant_id + category_id (aktif)
  - categories: tenant_id + sort_order
*/

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_branch_status
  ON restaurant_tables (branch_id, status)
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_tenant_branch
  ON restaurant_tables (tenant_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_current_order
  ON restaurant_tables (current_order_id)
  WHERE current_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_branch_status
  ON orders (branch_id, status, created_at DESC)
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_tenant_type_status
  ON orders (tenant_id, order_type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_table_id
  ON orders (table_id)
  WHERE table_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_online_orders_tenant_status
  ON online_orders (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id
  ON payment_transactions (order_id);

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_branch
  ON profiles (tenant_id, branch_id)
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_categories_tenant_sort
  ON categories (tenant_id, sort_order);

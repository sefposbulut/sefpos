-- POS sıcak yolları için ek partial / kapsayan indeksler.
-- Hedefler:
--  * TableGrid yüklemesi: restaurant_tables JOIN orders (current_order_id), filter branch_id
--  * OrderPanel: order_items WHERE order_id (cancelled_at IS NULL)
--  * Kasa / End-of-day: cash_register_transactions WHERE tenant_id, branch_id, created_at
--  * Order/Payment realtime UPDATE -> rapid lookup
-- Hepsi IF NOT EXISTS, kolon kontrolüyle güvenli.

BEGIN;

DO $$
BEGIN
  -- 1) Açık masa + sipariş hızlı join için
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='orders' AND column_name='branch_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='orders' AND column_name='table_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='orders' AND column_name='status') THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_orders_branch_table_active
        ON public.orders (branch_id, table_id)
        WHERE status IN ('active','open','pending')
    $sql$;
  END IF;

  -- 2) Tüm aktif/açık siparişler tek tarama (TableGrid global aggregate)
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='orders' AND column_name='tenant_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='orders' AND column_name='status')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='orders' AND column_name='branch_id') THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_orders_tenant_branch_active
        ON public.orders (tenant_id, branch_id, status)
        WHERE status IN ('active','open','pending')
    $sql$;
  END IF;

  -- 3) Açık masa fast scan (current_order_id + branch_id)
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='restaurant_tables' AND column_name='branch_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='restaurant_tables' AND column_name='current_order_id') THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_restaurant_tables_branch_with_order
        ON public.restaurant_tables (branch_id)
        WHERE current_order_id IS NOT NULL
    $sql$;
  END IF;

  -- 4) order_items panel sorgusu: WHERE order_id AND cancelled_at IS NULL covering
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='order_items' AND column_name='order_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='order_items' AND column_name='cancelled_at')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='order_items' AND column_name='created_at') THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_order_items_order_active_created
        ON public.order_items (order_id, created_at)
        WHERE cancelled_at IS NULL
    $sql$;
  END IF;

  -- 5) payment_transactions: order_id + amount toplama (TableGrid kismi ödeme görüntüsü)
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='payment_transactions' AND column_name='order_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='payment_transactions' AND column_name='amount') THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_amount
        ON public.payment_transactions (order_id) INCLUDE (amount)
    $sql$;
  END IF;

  -- 6) cash_register_transactions günlük raporlar
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='cash_register_transactions' AND column_name='tenant_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='cash_register_transactions' AND column_name='branch_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='cash_register_transactions' AND column_name='created_at') THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_crt_tenant_branch_date
        ON public.cash_register_transactions (tenant_id, branch_id, created_at DESC)
    $sql$;
  END IF;

  -- 7) waiter_calls realtime list
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='waiter_calls' AND column_name='tenant_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='waiter_calls' AND column_name='branch_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='waiter_calls' AND column_name='status')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='waiter_calls' AND column_name='created_at') THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_waiter_calls_tenant_branch_status
        ON public.waiter_calls (tenant_id, branch_id, status, created_at DESC)
    $sql$;
  END IF;

  -- 8) device_bindings tarafı: cihaz IP/durum kontrolu (her 30 sn polling)
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='device_bindings' AND column_name='device_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='device_bindings' AND column_name='waiter_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='device_bindings' AND column_name='tenant_id') THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_device_bindings_device_waiter_tenant
        ON public.device_bindings (device_id, waiter_id, tenant_id)
    $sql$;
  END IF;

  -- 9) Garson login: telefonla aranır
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='waiters' AND column_name='phone')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='waiters' AND column_name='status') THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_waiters_phone_status
        ON public.waiters (phone, status)
    $sql$;
  END IF;

  -- 10) categories sıralama (OrderPanel sol kolon)
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='categories' AND column_name='tenant_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='categories' AND column_name='sort_order') THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_categories_tenant_sort_order
        ON public.categories (tenant_id, sort_order, name)
    $sql$;
  END IF;

  -- 11) Branch-aware open table groups
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='table_groups' AND column_name='tenant_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='table_groups' AND column_name='branch_id') THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_table_groups_tenant_branch_name
        ON public.table_groups (tenant_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), name)
    $sql$;
  END IF;
END $$;

-- 12) Planlayıcı: yeni indeksleri görsün
ANALYZE public.orders;
ANALYZE public.order_items;
ANALYZE public.restaurant_tables;
ANALYZE public.payment_transactions;
ANALYZE public.products;
ANALYZE public.categories;
ANALYZE public.product_variants;

COMMIT;


/*
  # Performance Indexes for Speed Optimization

  Adds missing indexes for the most frequently queried patterns.
  Skips when tables/columns are absent (partial / legacy schemas).
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'table_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'status') THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_orders_table_active
        ON public.orders(table_id, status)
        WHERE status IN ('open', 'pending')
    $sql$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'tenant_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_active')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'category_id') THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_products_tenant_active
        ON public.products(tenant_id, is_active, category_id)
        WHERE is_active = true
    $sql$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'barcode') THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_products_barcode
        ON public.products(barcode)
        WHERE barcode IS NOT NULL
    $sql$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'order_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'cancelled_at') THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_order_items_order_notcancelled
        ON public.order_items(order_id)
        WHERE cancelled_at IS NULL
    $sql$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_transactions' AND column_name = 'order_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_transactions' AND column_name = 'created_at') THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_order
        ON public.payment_transactions(order_id, created_at DESC)
    $sql$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'tenant_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'status')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'updated_at') THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_orders_tenant_open
        ON public.orders(tenant_id, status, updated_at DESC)
        WHERE status IN ('open', 'pending')
    $sql$;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'product_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'is_active') THEN
    EXECUTE $sql$
      CREATE INDEX IF NOT EXISTS idx_product_variants_product_active
        ON public.product_variants(product_id, is_active)
        WHERE is_active = true
    $sql$;
  END IF;
END $$;

/*
  # Fix Security Issues - Part 1: Foreign Key Indexes

  Adds missing indexes on foreign key columns. Skips tables/columns that do not
  exist (legacy DBs where 20260325192031_create_complete_pos_system did not apply).
*/

-- Helper: create index only when table and all columns exist
DO $$
BEGIN
  -- cash_movements
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cash_movements'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cash_movements_created_by ON public.cash_movements(created_by)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cash_movements_register_id ON public.cash_movements(register_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cash_movements_tenant_id ON public.cash_movements(tenant_id)';
  END IF;

  -- cash_registers
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cash_registers'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cash_registers_closed_by ON public.cash_registers(closed_by)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cash_registers_opened_by ON public.cash_registers(opened_by)';
  END IF;

  -- customer_transactions
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'customer_transactions'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_customer_transactions_created_by ON public.customer_transactions(created_by)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_customer_transactions_customer_id ON public.customer_transactions(customer_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_customer_transactions_order_id ON public.customer_transactions(order_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_customer_transactions_tenant_id ON public.customer_transactions(tenant_id)';
  END IF;

  -- expenses
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'expenses'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON public.expenses(created_by)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_expenses_tenant_id ON public.expenses(tenant_id)';
  END IF;

  -- online_order_items
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'online_order_items'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'online_order_items' AND column_name = 'product_id'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_online_order_items_product_id ON public.online_order_items(product_id)';
    END IF;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_online_order_items_tenant_id ON public.online_order_items(tenant_id)';
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'online_order_items' AND column_name = 'variant_id'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_online_order_items_variant_id ON public.online_order_items(variant_id)';
    END IF;
  END IF;

  -- online_orders
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'online_orders'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'online_orders' AND column_name = 'created_by'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_online_orders_created_by ON public.online_orders(created_by)';
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'online_orders' AND column_name = 'internal_order_id'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_online_orders_internal_order_id ON public.online_orders(internal_order_id)';
    END IF;
  END IF;

  -- orders (columns vary by migration history)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'orders'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'created_by'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orders_created_by ON public.orders(created_by)';
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'customer_id'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id)';
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'waiter_id'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orders_waiter_id ON public.orders(waiter_id)';
    END IF;
  END IF;

  -- payment_transactions
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payment_transactions'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_transactions' AND column_name = 'created_by'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_by ON public.payment_transactions(created_by)';
  END IF;

  -- profiles
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON public.profiles(role_id)';
  END IF;

  -- table_groups
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'table_groups'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_table_groups_tenant_id ON public.table_groups(tenant_id)';
  END IF;
END $$;

-- Drop duplicate index (safe if missing)
DROP INDEX IF EXISTS public.idx_payment_transactions_order;

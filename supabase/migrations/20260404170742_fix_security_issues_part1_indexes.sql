/*
  # Fix Security Issues - Part 1: Foreign Key Indexes

  ## Overview
  Adds missing indexes on all foreign key columns to improve query performance.
  
  ## Changes
  Creates indexes for foreign keys in:
  - cash_movements
  - cash_registers
  - customer_transactions
  - expenses
  - online_order_items
  - online_orders
  - orders
  - payment_transactions
  - profiles
  - table_groups
*/

-- cash_movements indexes
CREATE INDEX IF NOT EXISTS idx_cash_movements_created_by ON public.cash_movements(created_by);
CREATE INDEX IF NOT EXISTS idx_cash_movements_register_id ON public.cash_movements(register_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_tenant_id ON public.cash_movements(tenant_id);

-- cash_registers indexes
CREATE INDEX IF NOT EXISTS idx_cash_registers_closed_by ON public.cash_registers(closed_by);
CREATE INDEX IF NOT EXISTS idx_cash_registers_opened_by ON public.cash_registers(opened_by);

-- customer_transactions indexes
CREATE INDEX IF NOT EXISTS idx_customer_transactions_created_by ON public.customer_transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_customer_id ON public.customer_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_order_id ON public.customer_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_customer_transactions_tenant_id ON public.customer_transactions(tenant_id);

-- expenses indexes
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON public.expenses(created_by);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_id ON public.expenses(tenant_id);

-- online_order_items indexes
CREATE INDEX IF NOT EXISTS idx_online_order_items_product_id ON public.online_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_online_order_items_tenant_id ON public.online_order_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_online_order_items_variant_id ON public.online_order_items(variant_id);

-- online_orders indexes
CREATE INDEX IF NOT EXISTS idx_online_orders_created_by ON public.online_orders(created_by);
CREATE INDEX IF NOT EXISTS idx_online_orders_internal_order_id ON public.online_orders(internal_order_id);

-- orders indexes
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON public.orders(created_by);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_waiter_id ON public.orders(waiter_id);

-- payment_transactions indexes
CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_by ON public.payment_transactions(created_by);

-- profiles indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON public.profiles(role_id);

-- table_groups indexes
CREATE INDEX IF NOT EXISTS idx_table_groups_tenant_id ON public.table_groups(tenant_id);

-- Drop duplicate index
DROP INDEX IF EXISTS public.idx_payment_transactions_order;

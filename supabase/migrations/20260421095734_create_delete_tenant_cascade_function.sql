/*
  # Create Delete Tenant Cascade Function

  Creates a PL/pgSQL function that safely deletes a tenant and all its related data.
  
  1. New Functions
    - `delete_tenant_cascade(tenant_id uuid)` - Safely delete tenant with all related data
  
  2. Data Deletion Order
    - Deletes in correct order respecting foreign key constraints
    - Handles all dependent tables: orders, transactions, products, users, etc.
    - Single atomic operation
*/

CREATE OR REPLACE FUNCTION public.delete_tenant_cascade(tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete order items first (depends on orders)
  DELETE FROM public.order_items
  WHERE order_id IN (
    SELECT id FROM public.orders WHERE tenant_id = tenant_id
  );

  -- Delete orders
  DELETE FROM public.orders WHERE tenant_id = tenant_id;

  -- Delete transactions
  DELETE FROM public.payment_transactions WHERE tenant_id = tenant_id;
  DELETE FROM public.cash_register_transactions WHERE tenant_id = tenant_id;
  DELETE FROM public.credit_transactions WHERE tenant_id = tenant_id;

  -- Delete products and variants
  DELETE FROM public.product_variants
  WHERE product_id IN (
    SELECT id FROM public.products WHERE tenant_id = tenant_id
  );
  DELETE FROM public.products WHERE tenant_id = tenant_id;

  -- Delete categories
  DELETE FROM public.categories WHERE tenant_id = tenant_id;

  -- Delete table groups and tables
  DELETE FROM public.restaurant_tables
  WHERE table_group_id IN (
    SELECT id FROM public.table_groups WHERE tenant_id = tenant_id
  );
  DELETE FROM public.table_groups WHERE tenant_id = tenant_id;

  -- Delete print jobs
  DELETE FROM public.print_jobs WHERE tenant_id = tenant_id;

  -- Delete support tickets
  DELETE FROM public.support_tickets WHERE tenant_id = tenant_id;

  -- Delete delivery orders
  DELETE FROM public.delivery_orders WHERE tenant_id = tenant_id;

  -- Delete couriers
  DELETE FROM public.couriers WHERE tenant_id = tenant_id;

  -- Delete customers
  DELETE FROM public.customers WHERE tenant_id = tenant_id;

  -- Delete profiles (users)
  DELETE FROM public.profiles WHERE tenant_id = tenant_id;

  -- Delete branches
  DELETE FROM public.branches WHERE tenant_id = tenant_id;

  -- Delete roles
  DELETE FROM public.roles WHERE tenant_id = tenant_id;

  -- Delete tenant
  DELETE FROM public.tenants WHERE id = tenant_id;
END;
$$;

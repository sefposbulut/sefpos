/*
  # Fix Delete Tenant Cascade - DO Keyword Reserved

  DO is a reserved SQL keyword. Use different alias names.
*/

DROP FUNCTION IF EXISTS public.delete_tenant_cascade(uuid);

CREATE OR REPLACE FUNCTION public.delete_tenant_cascade(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete order items first (depends on orders)
  DELETE FROM public.order_items oi
  WHERE oi.order_id IN (
    SELECT o.id FROM public.orders o WHERE o.tenant_id = p_tenant_id
  );

  -- Delete orders
  DELETE FROM public.orders o WHERE o.tenant_id = p_tenant_id;

  -- Delete transactions
  DELETE FROM public.payment_transactions pt WHERE pt.tenant_id = p_tenant_id;
  DELETE FROM public.cash_register_transactions crt WHERE crt.tenant_id = p_tenant_id;
  DELETE FROM public.credit_transactions ct WHERE ct.tenant_id = p_tenant_id;

  -- Delete products and variants
  DELETE FROM public.product_variants pv
  WHERE pv.product_id IN (
    SELECT p.id FROM public.products p WHERE p.tenant_id = p_tenant_id
  );
  DELETE FROM public.products p WHERE p.tenant_id = p_tenant_id;

  -- Delete categories
  DELETE FROM public.categories c WHERE c.tenant_id = p_tenant_id;

  -- Delete table groups and tables
  DELETE FROM public.restaurant_tables rt
  WHERE rt.table_group_id IN (
    SELECT tg.id FROM public.table_groups tg WHERE tg.tenant_id = p_tenant_id
  );
  DELETE FROM public.table_groups tg WHERE tg.tenant_id = p_tenant_id;

  -- Delete print jobs
  DELETE FROM public.print_jobs pj WHERE pj.tenant_id = p_tenant_id;

  -- Delete support tickets
  DELETE FROM public.support_tickets st WHERE st.tenant_id = p_tenant_id;

  -- Delete delivery orders
  DELETE FROM public.delivery_orders d WHERE d.tenant_id = p_tenant_id;

  -- Delete couriers
  DELETE FROM public.couriers cr WHERE cr.tenant_id = p_tenant_id;

  -- Delete customers
  DELETE FROM public.customers cust WHERE cust.tenant_id = p_tenant_id;

  -- Delete profiles (users)
  DELETE FROM public.profiles pr WHERE pr.tenant_id = p_tenant_id;

  -- Delete branches
  DELETE FROM public.branches b WHERE b.tenant_id = p_tenant_id;

  -- Delete roles
  DELETE FROM public.roles r WHERE r.tenant_id = p_tenant_id;

  -- Delete tenant
  DELETE FROM public.tenants t WHERE t.id = p_tenant_id;
END;
$$;

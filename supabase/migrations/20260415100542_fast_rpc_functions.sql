
/*
  # Fast RPC Functions for Performance Optimization

  Function bodies match available columns (e.g. order_items.cancelled_at).
*/

DO $$
DECLARE
  has_rt_branch boolean;
  has_rt_payment_lock boolean;
  has_rt_session boolean;
  has_rt_group boolean;
  has_oi_cancelled boolean;
  has_oi_total_amount boolean;
  has_oi_qty_unit boolean;
  join_extra text;
  item_total_sql text;
  sql_tables text;
  sql_order text;
  has_o_waiter_name boolean;
  has_o_total_amount boolean;
  has_o_total_legacy boolean;
  has_o_discount boolean;
  order_total_expr text;
  order_discount_expr text;
  waiter_expr text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'restaurant_tables'
  ) THEN
    has_rt_branch := EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'restaurant_tables' AND column_name = 'branch_id');
    has_rt_payment_lock := EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'restaurant_tables' AND column_name = 'payment_locked');
    has_rt_session := EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'restaurant_tables' AND column_name = 'session_start');
    has_rt_group := EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'restaurant_tables' AND column_name = 'group_id');

    IF has_rt_branch THEN
      sql_tables := $f$
CREATE OR REPLACE FUNCTION get_tables_for_branch(p_tenant_id uuid, p_branch_id uuid)
RETURNS TABLE(
  id uuid,
  table_number text,
  status text,
  capacity integer,
  size text,
  group_id uuid,
  current_order_id uuid,
  session_start timestamptz,
  payment_locked boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $fn$
  SELECT
    id,
    table_number,
    status,
    capacity,
    size,
$f$
        || CASE WHEN has_rt_group THEN $f$    group_id,$f$ ELSE $f$    NULL::uuid AS group_id,$f$ END
        || $f$
    current_order_id,
$f$
        || CASE WHEN has_rt_session THEN $f$    session_start,$f$ ELSE $f$    NULL::timestamptz AS session_start,$f$ END
        || CASE WHEN has_rt_payment_lock THEN $f$    payment_locked$f$ ELSE $f$    false AS payment_locked$f$ END
        || $f$
  FROM public.restaurant_tables
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
  ORDER BY table_number ASC;
$fn$;
$f$;
      EXECUTE sql_tables;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_items')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN

    has_oi_cancelled := EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'cancelled_at');
    has_oi_total_amount := EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'total_amount');
    has_oi_qty_unit := EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'quantity')
      AND EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'unit_price');

    has_o_waiter_name := EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'waiter_name');
    has_o_total_amount := EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'total_amount');
    has_o_total_legacy := EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'total');
    has_o_discount := EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'discount_amount');

    IF has_oi_cancelled THEN
      join_extra := ' AND oi.cancelled_at IS NULL';
    ELSE
      join_extra := '';
    END IF;

    IF has_oi_total_amount THEN
      item_total_sql := 'oi.total_amount';
    ELSIF has_oi_qty_unit THEN
      item_total_sql := '(oi.quantity * oi.unit_price)::numeric(10,2)';
    ELSE
      item_total_sql := 'NULL::numeric(10,2)';
    END IF;

    IF has_o_total_amount THEN
      order_total_expr := 'o.total_amount';
    ELSIF has_o_total_legacy THEN
      order_total_expr := 'o.total';
    ELSE
      order_total_expr := 'NULL::numeric';
    END IF;

    IF has_o_discount THEN
      order_discount_expr := 'o.discount_amount';
    ELSE
      order_discount_expr := '0::numeric';
    END IF;

    IF has_o_waiter_name THEN
      waiter_expr := 'o.waiter_name';
    ELSE
      waiter_expr := 'NULL::text';
    END IF;

    sql_order := format($f$
CREATE OR REPLACE FUNCTION get_active_order_for_table(p_table_id uuid, p_tenant_id uuid)
RETURNS TABLE(
  order_id uuid,
  order_number text,
  order_status text,
  waiter_name text,
  order_created_at timestamptz,
  order_total numeric,
  order_discount numeric,
  item_id uuid,
  product_id uuid,
  product_name text,
  variant_id uuid,
  variant_name text,
  quantity numeric,
  unit_price numeric,
  item_total numeric,
  item_notes text,
  item_created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $fn$
  SELECT
    o.id,
    o.order_number,
    o.status,
    %s,
    o.created_at,
    %s,
    %s,
    oi.id,
    oi.product_id,
    p.name,
    oi.variant_id,
    oi.variant_name,
    oi.quantity,
    oi.unit_price,
    %s,
    oi.notes,
    oi.created_at
  FROM public.orders o
  LEFT JOIN public.order_items oi ON oi.order_id = o.id%s
  LEFT JOIN public.products p ON p.id = oi.product_id
  WHERE o.table_id = p_table_id
    AND o.tenant_id = p_tenant_id
    AND o.status NOT IN ('completed', 'cancelled')
  ORDER BY oi.created_at ASC;
$fn$;
$f$, waiter_expr, order_total_expr, order_discount_expr, item_total_sql, join_extra);

    EXECUTE sql_order;
  END IF;
END $$;

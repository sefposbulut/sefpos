
/*
  # Fast RPC Functions for Performance Optimization

  1. get_tables_for_branch
     - Returns all table statuses for a branch in a single optimized query

  2. get_active_order_for_table
     - Returns the active order + all non-cancelled items + product names
     - Replaces 3 separate round-trips when opening a table
*/

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
AS $$
  SELECT 
    id,
    table_number,
    status,
    capacity,
    size,
    group_id,
    current_order_id,
    session_start,
    payment_locked
  FROM restaurant_tables
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
  ORDER BY table_number ASC;
$$;

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
AS $$
  SELECT
    o.id,
    o.order_number,
    o.status,
    o.waiter_name,
    o.created_at,
    o.total_amount,
    o.discount_amount,
    oi.id,
    oi.product_id,
    p.name,
    oi.variant_id,
    oi.variant_name,
    oi.quantity,
    oi.unit_price,
    oi.total_amount,
    oi.notes,
    oi.created_at
  FROM orders o
  LEFT JOIN order_items oi ON oi.order_id = o.id AND oi.cancelled_at IS NULL
  LEFT JOIN products p ON p.id = oi.product_id
  WHERE o.table_id = p_table_id
    AND o.tenant_id = p_tenant_id
    AND o.status IN ('open', 'pending')
  ORDER BY oi.created_at ASC;
$$;

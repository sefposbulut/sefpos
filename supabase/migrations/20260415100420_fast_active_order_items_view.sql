
/*
  # Fast View for Active Order Items

  Creates a materialized-style view for quickly fetching active (non-cancelled)
  order items with product info joined. This avoids expensive runtime joins
  in the order panel when opening a table.
*/

CREATE OR REPLACE VIEW active_order_items AS
  SELECT 
    oi.id,
    oi.order_id,
    oi.tenant_id,
    oi.product_id,
    oi.variant_id,
    oi.variant_name,
    oi.quantity,
    oi.unit_price,
    oi.total_amount,
    oi.notes,
    oi.created_at,
    oi.cancellation_reason,
    oi.cancelled_by,
    oi.cancelled_at,
    p.name AS product_name,
    p.price AS product_price,
    p.image_url AS product_image_url,
    p.category_id AS product_category_id
  FROM order_items oi
  INNER JOIN products p ON p.id = oi.product_id
  WHERE oi.cancelled_at IS NULL;

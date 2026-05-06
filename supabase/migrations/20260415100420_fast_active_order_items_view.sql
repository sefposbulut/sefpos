
/*
  # Fast View for Active Order Items

  View definition adapts to available order_items / products columns (legacy vs full schema).
*/

DO $$
DECLARE
  has_tenant boolean;
  has_variant_id boolean;
  has_variant_name boolean;
  has_cancellation_reason boolean;
  has_cancelled_by boolean;
  has_cancelled_at boolean;
  has_total_amount boolean;
  has_qty_price boolean;
  has_notes boolean;
  has_created_at boolean;
  has_product_image boolean;
  has_product_category boolean;
  amt_sql text;
  where_sql text;
  sql text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'order_items'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products'
  ) THEN

  has_tenant := EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'tenant_id');
  has_variant_id := EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'variant_id');
  has_variant_name := EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'variant_name');
  has_cancellation_reason := EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'cancellation_reason');
  has_cancelled_by := EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'cancelled_by');
  has_cancelled_at := EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'cancelled_at');
  has_total_amount := EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'total_amount');
  has_qty_price := EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'quantity')
    AND EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'unit_price');
  has_notes := EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'notes');
  has_created_at := EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'created_at');
  has_product_image := EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'image_url');
  has_product_category := EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'category_id');

  IF has_total_amount THEN
    amt_sql := 'oi.total_amount';
  ELSIF has_qty_price THEN
    amt_sql := '(oi.quantity * oi.unit_price)::numeric(10,2)';
  ELSE
    amt_sql := 'NULL::numeric(10,2)';
  END IF;

  IF has_cancelled_at THEN
    where_sql := 'oi.cancelled_at IS NULL';
  ELSE
    where_sql := 'true';
  END IF;

  sql := $base$
CREATE OR REPLACE VIEW active_order_items AS
  SELECT
    oi.id,
    oi.order_id,
$base$
    || CASE WHEN has_tenant THEN $b$    oi.tenant_id,$b$ ELSE $b$    NULL::uuid AS tenant_id,$b$ END
    || $base$
    oi.product_id,
$base$
    || CASE WHEN has_variant_id THEN $b$    oi.variant_id,$b$ ELSE $b$    NULL::uuid AS variant_id,$b$ END
    || CASE WHEN has_variant_name THEN $b$    oi.variant_name,$b$ ELSE $b$    NULL::text AS variant_name,$b$ END
    || $base$
    oi.quantity,
    oi.unit_price,
$base$
    || format($b$    %s AS total_amount,$b$, amt_sql)
    || CASE WHEN has_notes THEN $b$    oi.notes,$b$ ELSE $b$    NULL::text AS notes,$b$ END
    || CASE WHEN has_created_at THEN $b$    oi.created_at,$b$ ELSE $b$    NULL::timestamptz AS created_at,$b$ END
    || CASE WHEN has_cancellation_reason THEN $b$    oi.cancellation_reason,$b$ ELSE $b$    NULL::text AS cancellation_reason,$b$ END
    || CASE WHEN has_cancelled_by THEN $b$    oi.cancelled_by,$b$ ELSE $b$    NULL::uuid AS cancelled_by,$b$ END
    || CASE WHEN has_cancelled_at THEN $b$    oi.cancelled_at,$b$ ELSE $b$    NULL::timestamptz AS cancelled_at,$b$ END
    || $base$
    p.name AS product_name,
    p.price AS product_price,
$base$
    || CASE WHEN has_product_image THEN $b$    p.image_url AS product_image_url,$b$ ELSE $b$    NULL::text AS product_image_url,$b$ END
    || CASE WHEN has_product_category THEN $b$    p.category_id AS product_category_id$b$ ELSE $b$    NULL::uuid AS product_category_id$b$ END
    || $base$
  FROM public.order_items oi
  INNER JOIN public.products p ON p.id = oi.product_id
  WHERE $base$
    || where_sql;

  EXECUTE sql;
  END IF;
END $$;

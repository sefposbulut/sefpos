-- Sipariş numarası: (tenant_id, order_number) tekil — şube bazlı sayaç aynı PAKET-01 üretiyordu.
-- Kiracı + iş günü + önek için tek sıra; mevcut numara varsa bir sonrakine atla.

CREATE OR REPLACE FUNCTION public.next_order_number_for_row(p_row public.orders)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix text;
  v_business_date date;
  v_branch_key uuid;
  v_next integer;
  v_from_orders integer;
  v_from_counter integer;
  v_pad int;
  v_candidate text;
BEGIN
  IF p_row.order_subtype = 'gel_al' THEN
    v_prefix := 'GELAL';
  ELSIF p_row.order_type IN ('takeaway', 'delivery') THEN
    v_prefix := 'PAKET';
  ELSE
    v_prefix := 'SIP';
  END IF;

  v_business_date := public.compute_business_date(COALESCE(p_row.created_at, now()), p_row.branch_id);
  v_branch_key := '00000000-0000-0000-0000-000000000000'::uuid;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_row.tenant_id::text || ':' || v_business_date::text || ':' || v_prefix,
      0
    )
  );

  SELECT COALESCE(MAX(
    (regexp_match(o.order_number, '^' || v_prefix || '-([0-9]+)$'))[1]::int
  ), 0) + 1
  INTO v_from_orders
  FROM public.orders o
  WHERE o.tenant_id = p_row.tenant_id
    AND o.order_number ~ ('^' || v_prefix || '-[0-9]+$')
    AND public.compute_business_date(o.created_at, o.branch_id) = v_business_date;

  INSERT INTO public.order_daily_counters (tenant_id, branch_key, business_date, seq_prefix, last_value)
  VALUES (p_row.tenant_id, v_branch_key, v_business_date, v_prefix, GREATEST(v_from_orders, 1))
  ON CONFLICT (tenant_id, branch_key, business_date, seq_prefix)
  DO UPDATE SET
    last_value = GREATEST(public.order_daily_counters.last_value + 1, v_from_orders),
    updated_at = now()
  RETURNING last_value INTO v_from_counter;

  v_next := GREATEST(v_from_orders, v_from_counter);

  LOOP
    v_pad := GREATEST(2, length(v_next::text));
    v_candidate := v_prefix || '-' || lpad(v_next::text, v_pad, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.tenant_id = p_row.tenant_id
        AND o.order_number = v_candidate
    );
    v_next := v_next + 1;
  END LOOP;

  INSERT INTO public.order_daily_counters (tenant_id, branch_key, business_date, seq_prefix, last_value)
  VALUES (p_row.tenant_id, v_branch_key, v_business_date, v_prefix, v_next)
  ON CONFLICT (tenant_id, branch_key, business_date, seq_prefix)
  DO UPDATE SET
    last_value = GREATEST(public.order_daily_counters.last_value, EXCLUDED.last_value),
    updated_at = now();

  RETURN v_candidate;
END;
$$;

NOTIFY pgrst, 'reload schema';

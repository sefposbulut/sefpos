-- Paket siparişi INSERT: next_order_number_for_row tüm orders tablosunu tarayıp
-- compute_business_date + regex ile sayıyordu → statement timeout → HTTP 500.
-- Sayaç tablosu + indeksli tekil kontrol (tenant_id, order_number).

CREATE OR REPLACE FUNCTION public.next_order_number_for_row(p_row public.orders)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix text;
  v_business_date date;
  v_branch_key uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_next integer;
  v_pad int;
  v_candidate text;
  v_attempt int := 0;
  v_max_attempts int := 32;
BEGIN
  IF p_row.order_subtype = 'gel_al' THEN
    v_prefix := 'GELAL';
  ELSIF p_row.order_type IN ('takeaway', 'delivery') THEN
    v_prefix := 'PAKET';
  ELSE
    v_prefix := 'SIP';
  END IF;

  v_business_date := public.compute_business_date(COALESCE(p_row.created_at, now()), p_row.branch_id);

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_row.tenant_id::text || ':' || v_business_date::text || ':' || v_prefix,
      0
    )
  );

  INSERT INTO public.order_daily_counters (tenant_id, branch_key, business_date, seq_prefix, last_value)
  VALUES (p_row.tenant_id, v_branch_key, v_business_date, v_prefix, 1)
  ON CONFLICT (tenant_id, branch_key, business_date, seq_prefix)
  DO UPDATE SET
    last_value = public.order_daily_counters.last_value + 1,
    updated_at = now()
  RETURNING last_value INTO v_next;

  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > v_max_attempts THEN
      RAISE EXCEPTION 'order_number allocation failed after % attempts', v_max_attempts;
    END IF;

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

  UPDATE public.order_daily_counters
  SET
    last_value = GREATEST(last_value, v_next),
    updated_at = now()
  WHERE tenant_id = p_row.tenant_id
    AND branch_key = v_branch_key
    AND business_date = v_business_date
    AND seq_prefix = v_prefix;

  RETURN v_candidate;
END;
$$;

COMMENT ON FUNCTION public.next_order_number_for_row(public.orders) IS
  'Hızlı günlük sipariş numarası (PAKET/GELAL/SIP). order_daily_counters + UNIQUE(tenant_id, order_number).';

NOTIFY pgrst, 'reload schema';

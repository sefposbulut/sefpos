-- Günlük sayaç PAKET-01'den başlıyor ama (tenant_id, order_number) tekil —
-- önceki günlerin PAKET-01..N kayıtlarıyla çakışıp 32 denemede hata veriyordu (HTTP 400).
-- Çözüm: global max + 1 taban; günlük sayaç yalnızca rapor için kalır.

CREATE OR REPLACE FUNCTION public.next_order_number_for_row(p_row public.orders)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix text;
  v_business_date date;
  v_branch_key uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_next integer;
  v_global_max integer;
  v_pad int;
  v_candidate text;
  v_attempt int := 0;
  v_max_attempts int := 16;
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
      p_row.tenant_id::text || ':' || v_prefix,
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

  SELECT COALESCE(MAX(
    (regexp_match(o.order_number, '^' || v_prefix || '-([0-9]+)$'))[1]::int
  ), 0)
  INTO v_global_max
  FROM public.orders o
  WHERE o.tenant_id = p_row.tenant_id
    AND o.order_number LIKE v_prefix || '-%';

  v_next := GREATEST(v_next, v_global_max + 1);

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
  'PAKET/GELAL/SIP numarası: tenant genelinde tekil (global max+1), günlük sayaç istatistik için.';

NOTIFY pgrst, 'reload schema';

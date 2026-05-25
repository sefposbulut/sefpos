-- Paket / teslimat sipariş numarası: iş günü başlangıcına göre günlük sıra (PAKET-01, PAKET-02, …)
-- Eski: global order_number_seq → PAKET-000207 gibi sürekli artan numara.

CREATE TABLE IF NOT EXISTS public.order_daily_counters (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_key uuid NOT NULL,
  business_date date NOT NULL,
  seq_prefix text NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, branch_key, business_date, seq_prefix)
);

COMMENT ON TABLE public.order_daily_counters IS
  'Şube + iş günü bazlı sipariş sıra sayacı (PAKET, GELAL, SIP).';

CREATE OR REPLACE FUNCTION public.next_order_number_for_row(p_row public.orders)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix text;
  v_business_date date;
  v_branch_key uuid;
  v_next integer;
  v_pad int;
BEGIN
  IF p_row.order_subtype = 'gel_al' THEN
    v_prefix := 'GELAL';
  ELSIF p_row.order_type IN ('takeaway', 'delivery') THEN
    v_prefix := 'PAKET';
  ELSE
    v_prefix := 'SIP';
  END IF;

  v_business_date := public.compute_business_date(COALESCE(p_row.created_at, now()), p_row.branch_id);
  v_branch_key := COALESCE(p_row.branch_id, '00000000-0000-0000-0000-000000000000'::uuid);

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_row.tenant_id::text || ':' || v_branch_key::text || ':' || v_business_date::text || ':' || v_prefix,
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

  v_pad := GREATEST(2, length(v_next::text));
  RETURN v_prefix || '-' || lpad(v_next::text, v_pad, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_number IS NULL OR btrim(NEW.order_number) = '' THEN
    NEW.order_number := public.next_order_number_for_row(NEW);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_generate_number ON public.orders;
CREATE TRIGGER orders_generate_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_order_number();

NOTIFY pgrst, 'reload schema';

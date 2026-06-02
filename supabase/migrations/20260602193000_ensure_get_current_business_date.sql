/*
  # get_current_business_date — idempotent onarım
  Bazı ortamlarda migration atlanmışsa PostgREST 400 döner; bu dosya fonksiyonu yeniden kurar.
*/

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS business_day_start_hour smallint NOT NULL DEFAULT 6
  CHECK (business_day_start_hour BETWEEN 0 AND 23);

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS business_day_mode text NOT NULL DEFAULT 'cutoff'
  CHECK (business_day_mode IN ('cutoff','manual'));

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS business_day_start_hour smallint
  CHECK (business_day_start_hour IS NULL OR business_day_start_hour BETWEEN 0 AND 23);

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS business_day_mode text
  CHECK (business_day_mode IS NULL OR business_day_mode IN ('cutoff','manual'));

DROP FUNCTION IF EXISTS public.compute_business_date(timestamptz, uuid);
CREATE OR REPLACE FUNCTION public.compute_business_date(
  p_at timestamptz,
  p_branch_id uuid
) RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cutoff smallint := 6;
  v_mode   text     := 'cutoff';
  v_hour   smallint;
  v_last_closed date;
BEGIN
  IF p_branch_id IS NOT NULL THEN
    SELECT
      COALESCE(b.business_day_start_hour, t.business_day_start_hour, 6),
      COALESCE(b.business_day_mode,       t.business_day_mode,       'cutoff')
      INTO v_cutoff, v_mode
      FROM public.branches b
      JOIN public.tenants  t ON t.id = b.tenant_id
     WHERE b.id = p_branch_id
     LIMIT 1;
  END IF;

  IF v_mode = 'manual' AND p_branch_id IS NOT NULL THEN
    SELECT MAX(business_date)
      INTO v_last_closed
      FROM public.daily_closures
     WHERE branch_id = p_branch_id AND status = 'closed';
    IF v_last_closed IS NOT NULL THEN
      RETURN v_last_closed + 1;
    END IF;
    RETURN (p_at AT TIME ZONE 'UTC')::date;
  END IF;

  v_hour := EXTRACT(HOUR FROM p_at)::smallint;
  IF v_hour < v_cutoff THEN
    RETURN (p_at AT TIME ZONE 'UTC')::date - 1;
  END IF;
  RETURN (p_at AT TIME ZONE 'UTC')::date;
END;
$$;

DROP FUNCTION IF EXISTS public.get_current_business_date(uuid);
CREATE OR REPLACE FUNCTION public.get_current_business_date(
  p_branch_id uuid
) RETURNS TABLE (
  business_date date,
  mode          text,
  cutoff_hour   smallint,
  last_closed   date,
  hours_open    numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode  text     := 'cutoff';
  v_cutoff smallint := 6;
  v_last  date;
  v_first_open timestamptz;
  v_hours numeric := NULL;
BEGIN
  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_id zorunlu' USING ERRCODE = '22023';
  END IF;

  SELECT
    COALESCE(b.business_day_start_hour, t.business_day_start_hour, 6),
    COALESCE(b.business_day_mode,       t.business_day_mode,       'cutoff')
    INTO v_cutoff, v_mode
    FROM public.branches b
    JOIN public.tenants  t ON t.id = b.tenant_id
   WHERE b.id = p_branch_id
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'branch bulunamadi: %', p_branch_id USING ERRCODE = '22023';
  END IF;

  SELECT MAX(business_date) INTO v_last
    FROM public.daily_closures
   WHERE branch_id = p_branch_id AND status = 'closed';

  IF v_mode = 'manual' THEN
    SELECT MIN(opened_at)
      INTO v_first_open
      FROM public.shifts
     WHERE branch_id = p_branch_id
       AND (v_last IS NULL OR business_date > v_last);
    IF v_first_open IS NOT NULL THEN
      v_hours := EXTRACT(EPOCH FROM (now() - v_first_open)) / 3600.0;
    END IF;
  END IF;

  RETURN QUERY SELECT
    public.compute_business_date(now(), p_branch_id),
    v_mode,
    v_cutoff,
    v_last,
    v_hours;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_business_date(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

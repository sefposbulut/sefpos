/*
  # İş günü modu — Otomatik (cutoff) veya Manuel (24/7)

  ## Sorun
  24 saat açık işletmelerde sabit bir cutoff saati her zaman doğru
  çalışmaz. Bu işletmeler "gün ancak Z raporu alınınca biter" mantığı
  ister.

  ## Tasarım
  - tenants.business_day_mode text 'cutoff' | 'manual', default 'cutoff'
  - branches.business_day_mode text NULL — şube override (NULL=tenant)
  - compute_business_date(p_at, p_branch_id):
    * cutoff modu: eskisi gibi saat bazlı
    * manual modu: en son daily_closures.business_date + 1, hiç kapanmamışsa
      şu anki takvim günü
  - get_current_business_date(p_branch_id) RPC: client'a güncel iş günü
    tarihini döner (mod fark etmeden)
  - shift_open_too_long_hours(p_branch_id): manuel modda gün ne kadardır
    açık (uyarı için kullanılabilir)

  ## Idempotent
*/

-- 1) Kolonlari ekle
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS business_day_mode text NOT NULL DEFAULT 'cutoff'
  CHECK (business_day_mode IN ('cutoff','manual'));

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS business_day_mode text
  CHECK (business_day_mode IS NULL OR business_day_mode IN ('cutoff','manual'));

COMMENT ON COLUMN public.tenants.business_day_mode IS
'cutoff = sabit saatte gun degisir, manual = sadece "Gunu Kapat" tiklayinca biter (7/24)';

COMMENT ON COLUMN public.branches.business_day_mode IS
'Sube override; NULL ise tenant default kullanilir.';

-- 2) compute_business_date — manuel modu destekle
--    Not: Manuel mod tabloya bagli oldugu icin IMMUTABLE degil, STABLE.
DROP FUNCTION IF EXISTS public.compute_business_date(timestamptz, uuid);
CREATE OR REPLACE FUNCTION public.compute_business_date(
  p_at timestamptz,
  p_branch_id uuid
) RETURNS date
LANGUAGE plpgsql
STABLE
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

  -- cutoff modu (default)
  v_hour := EXTRACT(HOUR FROM p_at)::smallint;
  IF v_hour < v_cutoff THEN
    RETURN (p_at AT TIME ZONE 'UTC')::date - 1;
  END IF;
  RETURN (p_at AT TIME ZONE 'UTC')::date;
END;
$$;

-- 3) RPC: client guncel is gunu tarihini sorabilsin
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
    RAISE EXCEPTION 'branch_id zorunlu';
  END IF;

  SELECT
    COALESCE(b.business_day_start_hour, t.business_day_start_hour, 6),
    COALESCE(b.business_day_mode,       t.business_day_mode,       'cutoff')
    INTO v_cutoff, v_mode
    FROM public.branches b
    JOIN public.tenants  t ON t.id = b.tenant_id
   WHERE b.id = p_branch_id
   LIMIT 1;

  SELECT MAX(business_date) INTO v_last
    FROM public.daily_closures
   WHERE branch_id = p_branch_id AND status = 'closed';

  IF v_mode = 'manual' THEN
    -- Manuel modda gun acik suresi: son kapamadan sonraki ilk vardiya yada
    -- siparise bakariz (her ikisinden hangisi varsa en eski olani).
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

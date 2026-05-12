/*
  # İş günü başlangıç saati (cutoff hour) — şube bazlı

  ## Sorun
  compute_business_date() içinde 06:00 sabit kodluydu. Farklı işletmelerin
  farklı çalışma saatleri var — bazıları sabah 5'te açılıyor, bazıları
  öğlen 11'de. Bu yüzden şube bazlı bir cutoff saati gerekiyor.

  ## Tasarım
  - tenants.business_day_start_hour smallint (0-23), default 6.
  - branches.business_day_start_hour smallint NULL — şube override'ı; NULL
    ise tenant default'u kullanılır.
  - compute_business_date(p_at, p_branch_id) artık branch_id alır,
    branch'tan ya da tenant'tan cutoff'u okur.
  - Geriye uyumluluk için compute_business_date(p_at) overload'u da kalır
    ve TENANT default'u 6'yı kullanır.
  - start_shift ve close_business_day branch_id ile yeni overload'u çağırır.

  ## Idempotent
  - ADD COLUMN IF NOT EXISTS, OR REPLACE FUNCTION.
*/

-- 1) Kolon ekle
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS business_day_start_hour smallint NOT NULL DEFAULT 6
  CHECK (business_day_start_hour BETWEEN 0 AND 23);

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS business_day_start_hour smallint
  CHECK (business_day_start_hour IS NULL OR business_day_start_hour BETWEEN 0 AND 23);

COMMENT ON COLUMN public.tenants.business_day_start_hour IS
'Tenant geneli iş günü başlangıç saati (0-23). Default 6.';

COMMENT ON COLUMN public.branches.business_day_start_hour IS
'Bu şubenin iş günü başlangıç saati (override). NULL ise tenant default kullanılır.';

-- 2) Yeni overload: branch_id ile (OR REPLACE + DEFAULT kısıtları için DROP+CREATE)
DROP FUNCTION IF EXISTS public.compute_business_date(timestamptz, uuid);
CREATE FUNCTION public.compute_business_date(
  p_at timestamptz,
  p_branch_id uuid
) RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cutoff smallint := 6;
  v_hour   smallint;
BEGIN
  IF p_branch_id IS NOT NULL THEN
    SELECT COALESCE(b.business_day_start_hour, t.business_day_start_hour, 6)
      INTO v_cutoff
      FROM public.branches b
      JOIN public.tenants  t ON t.id = b.tenant_id
     WHERE b.id = p_branch_id
     LIMIT 1;
  END IF;

  v_hour := EXTRACT(HOUR FROM p_at)::smallint;

  IF v_hour < v_cutoff THEN
    RETURN (p_at AT TIME ZONE 'UTC')::date - 1;
  END IF;
  RETURN (p_at AT TIME ZONE 'UTC')::date;
END;
$$;

-- 3) Eski overload (yalnız timestamptz) artık tenant'tan değil sabit 6 kullanır
--    AMA mevcut kod yollarını bozmamak için aynı imzayla bırakıyoruz.
--    CREATE OR REPLACE aynı imzada DEFAULT değiştirirken PG hata verebilir; önce DROP.
DROP FUNCTION IF EXISTS public.compute_business_date(timestamptz);
CREATE FUNCTION public.compute_business_date(p_at timestamptz DEFAULT now())
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_hour smallint;
BEGIN
  v_hour := EXTRACT(HOUR FROM p_at)::smallint;
  IF v_hour < 6 THEN
    RETURN (p_at AT TIME ZONE 'UTC')::date - 1;
  END IF;
  RETURN (p_at AT TIME ZONE 'UTC')::date;
END;
$$;

-- 4) start_shift -> branch'lı overload'u kullan
--    Mevcut imzayı koruyoruz, sadece compute_business_date çağrısını güncelliyoruz.
DROP FUNCTION IF EXISTS public.start_shift(uuid, smallint, numeric, jsonb, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.start_shift(uuid, smallint, numeric, jsonb, text, text, text);
CREATE FUNCTION public.start_shift(
  p_branch_id uuid,
  p_shift_no smallint,
  p_opening_cash numeric DEFAULT 0,
  p_breakdown jsonb DEFAULT NULL,
  p_terminal_id text DEFAULT NULL,
  p_terminal_name text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_shift_definition_id uuid DEFAULT NULL
) RETURNS public.shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_def public.shift_definitions%ROWTYPE;
  v_business_date date;
  v_existing public.shifts%ROWTYPE;
  v_new public.shifts%ROWTYPE;
  v_shift_no smallint;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Yetki yok';
  END IF;

  -- Tanim secimi: oncelik p_shift_definition_id > p_shift_no > saatten otomatik
  IF p_shift_definition_id IS NOT NULL THEN
    SELECT * INTO v_def FROM public.shift_definitions
     WHERE id = p_shift_definition_id
       AND tenant_id = v_tenant_id
       AND branch_id = p_branch_id
       AND is_active = true
     LIMIT 1;
    IF v_def.id IS NULL THEN
      RAISE EXCEPTION 'Vardiya tanimi bulunamadi/aktif degil';
    END IF;
    v_shift_no := v_def.shift_no;
  ELSE
    v_shift_no := COALESCE(p_shift_no, 1);
    SELECT * INTO v_def FROM public.shift_definitions
     WHERE tenant_id = v_tenant_id
       AND branch_id = p_branch_id
       AND shift_no = v_shift_no
       AND is_active = true
     ORDER BY created_at
     LIMIT 1;
  END IF;

  v_business_date := public.compute_business_date(now(), p_branch_id);

  IF EXISTS (
    SELECT 1 FROM public.daily_closures
    WHERE branch_id = p_branch_id AND business_date = v_business_date AND status = 'closed'
  ) THEN
    RAISE EXCEPTION 'Bu gun (%) zaten kapatildi. Vardiya acilamaz.', v_business_date;
  END IF;

  -- Ayni kullanicinin acik vardiyasi varsa onu don
  SELECT * INTO v_existing FROM public.shifts
   WHERE tenant_id = v_tenant_id
     AND branch_id = p_branch_id
     AND opened_by = auth.uid()
     AND status = 'open'
   ORDER BY opened_at DESC LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.shifts (
    tenant_id, branch_id, shift_definition_id, shift_no, shift_name, business_date,
    terminal_id, terminal_name,
    opened_by, opening_cash, opening_cash_breakdown, opening_notes
  ) VALUES (
    v_tenant_id, p_branch_id, v_def.id, v_shift_no,
    COALESCE(v_def.name, 'Vardiya ' || v_shift_no),
    v_business_date,
    p_terminal_id, p_terminal_name,
    auth.uid(), COALESCE(p_opening_cash,0), p_breakdown, p_notes
  ) RETURNING * INTO v_new;

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_shift(uuid, smallint, numeric, jsonb, text, text, text, uuid) TO authenticated;

-- 5) close_business_day -> branch'lı overload'u kullan
DROP FUNCTION IF EXISTS public.close_business_day(uuid, date, text);
CREATE FUNCTION public.close_business_day(
  p_branch_id uuid,
  p_business_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS public.daily_closures
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_date date;
  v_open_cnt integer;
  v_summary record;
  v_row public.daily_closures%ROWTYPE;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Yetki yok';
  END IF;

  v_date := COALESCE(p_business_date, public.compute_business_date(now(), p_branch_id));

  SELECT COUNT(*) INTO v_open_cnt FROM public.shifts
  WHERE tenant_id = v_tenant_id
    AND business_date = v_date
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND status = 'open';
  IF v_open_cnt > 0 THEN
    RAISE EXCEPTION 'Acik vardiya kalmis. Once tum vardiyalari kapatin.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.daily_closures
    WHERE branch_id = p_branch_id AND business_date = v_date AND status = 'closed'
  ) THEN
    RAISE EXCEPTION 'Bu gun zaten kapatildi.';
  END IF;

  -- Ozet hesapla (gerekirse genisletilebilir)
  SELECT
    COALESCE(SUM(s.total_revenue), 0)         AS total_revenue,
    COALESCE(SUM(s.total_cash), 0)            AS total_cash,
    COALESCE(SUM(s.total_card), 0)            AS total_card,
    COALESCE(SUM(s.total_orders), 0)          AS total_orders,
    COALESCE(SUM(s.expected_cash), 0)         AS expected_cash,
    COALESCE(SUM(s.closing_cash), 0)          AS closing_cash,
    COALESCE(SUM(s.cash_difference), 0)       AS cash_difference
  INTO v_summary
  FROM public.shifts s
  WHERE s.tenant_id = v_tenant_id
    AND s.business_date = v_date
    AND (p_branch_id IS NULL OR s.branch_id = p_branch_id);

  INSERT INTO public.daily_closures (
    tenant_id, branch_id, business_date, status,
    total_revenue, total_cash, total_card, total_orders,
    expected_cash, closing_cash, cash_difference,
    closed_by, closed_at, notes
  ) VALUES (
    v_tenant_id, p_branch_id, v_date, 'closed',
    v_summary.total_revenue, v_summary.total_cash, v_summary.total_card, v_summary.total_orders,
    v_summary.expected_cash, v_summary.closing_cash, v_summary.cash_difference,
    auth.uid(), now(), p_notes
  ) RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_business_day(uuid, date, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

/*
  # Vardiya tanimlari esnek + kullanici atamasi

  ## Degisiklikler
  - shift_definitions.shift_no CHECK 1-9 (eski 1-6 idi). Admin 2 vardiyaya
    indirebilir, 5 vardiyaya cikabilir.
  - profiles.shift_definition_id (uuid, nullable, FK shift_definitions).
    Kullaniciya bir vardiya atanmissa otomatik prompt o vardiyayi onerir.
  - start_shift RPC: yeni p_shift_definition_id parametresi (oncelikli).
    Yoksa shift_no'dan tanim bul; yoksa saatten otomatik (geriye uyum).

  ## Idempotent
*/

-- 1) shift_definitions.shift_no araligini esnet
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.shift_definitions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%shift_no%';
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.shift_definitions DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END
$$;

ALTER TABLE public.shift_definitions
  ADD CONSTRAINT shift_definitions_shift_no_check
  CHECK (shift_no BETWEEN 1 AND 9);

-- 2) profiles.shift_definition_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='shift_definition_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles ADD COLUMN shift_definition_id uuid';
    EXECUTE 'ALTER TABLE public.profiles ADD CONSTRAINT profiles_shift_definition_id_fkey '
            || 'FOREIGN KEY (shift_definition_id) REFERENCES public.shift_definitions(id) ON DELETE SET NULL';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_profiles_shift_definition ON public.profiles(shift_definition_id);

-- 3) start_shift — p_shift_definition_id oncelikli
DROP FUNCTION IF EXISTS public.start_shift(uuid, smallint, numeric, jsonb, text, text, text);

CREATE OR REPLACE FUNCTION public.start_shift(
  p_branch_id uuid,
  p_shift_no smallint DEFAULT NULL,
  p_opening_cash numeric DEFAULT 0,
  p_breakdown jsonb DEFAULT NULL,
  p_terminal_id text DEFAULT NULL,
  p_terminal_name text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_shift_definition_id uuid DEFAULT NULL
) RETURNS public.shifts AS $$
DECLARE
  v_tenant_id uuid;
  v_def public.shift_definitions%ROWTYPE;
  v_existing public.shifts%ROWTYPE;
  v_business_date date;
  v_row public.shifts%ROWTYPE;
  v_hour int;
  v_shift_no smallint;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Yetki yok: profile bulunamadi';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'Sube tenant ile eslemiyor';
  END IF;

  -- 1) shift_definition_id verildiyse onu kullan
  IF p_shift_definition_id IS NOT NULL THEN
    SELECT * INTO v_def FROM public.shift_definitions
    WHERE id = p_shift_definition_id AND tenant_id = v_tenant_id;
    IF v_def.id IS NULL THEN
      RAISE EXCEPTION 'Vardiya tanimi bulunamadi';
    END IF;
    v_shift_no := v_def.shift_no;
  ELSE
    -- 2) shift_no verildiyse / yoksa saatten otomatik (1=06-14, 2=14-22, 3=22-06)
    v_shift_no := p_shift_no;
    IF v_shift_no IS NULL THEN
      v_hour := EXTRACT(HOUR FROM now())::int;
      IF v_hour >= 6 AND v_hour < 14 THEN v_shift_no := 1;
      ELSIF v_hour >= 14 AND v_hour < 22 THEN v_shift_no := 2;
      ELSE v_shift_no := 3;
      END IF;
    END IF;

    SELECT * INTO v_def FROM public.shift_definitions
    WHERE branch_id = p_branch_id AND shift_no = v_shift_no
    LIMIT 1;
  END IF;

  -- Bu kullanicinin acik vardiyasi var mi?
  SELECT * INTO v_existing FROM public.shifts
  WHERE branch_id = p_branch_id
    AND opened_by = auth.uid()
    AND status = 'open'
  LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    RAISE EXCEPTION 'Zaten acik vardiyaniz var (#%)', v_existing.shift_no
      USING ERRCODE = 'unique_violation';
  END IF;

  v_business_date := public.compute_business_date(now());

  IF EXISTS (
    SELECT 1 FROM public.daily_closures
    WHERE branch_id = p_branch_id
      AND business_date = v_business_date
      AND status = 'closed'
  ) THEN
    RAISE EXCEPTION 'Bu gun (%) kapatildi. Vardiya acilamaz.', v_business_date;
  END IF;

  INSERT INTO public.shifts (
    tenant_id, branch_id, shift_definition_id, shift_no, shift_name, business_date,
    terminal_id, terminal_name,
    opened_by, opening_cash, opening_cash_breakdown, opening_notes
  ) VALUES (
    v_tenant_id, p_branch_id, v_def.id, v_shift_no,
    COALESCE(v_def.name, 'Vardiya ' || v_shift_no::text),
    v_business_date,
    p_terminal_id, p_terminal_name,
    auth.uid(), COALESCE(p_opening_cash, 0), p_breakdown, p_notes
  ) RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.start_shift(uuid, smallint, numeric, jsonb, text, text, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

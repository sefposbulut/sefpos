/*
  # Vardiya sistemi v2 — Kullanici bazli paralel mod + opsiyonel toggle

  ## Degisiklikler
  - tenants.shifts_enabled boolean DEFAULT false  (Settings'ten admin acar)
  - UNIQUE index degisti: branch+user (paralel mod — ayni anda farkli kullanicilar
    kendi vardiyalarini acabilir).
  - start_shift RPC: shift_no opsiyonel (saatten otomatik), kullanici bazli kontrol
  - my_active_shift RPC: kullanicinin kendi acik vardiyasi
  - log_payment_to_cash_register: ONCE order.created_by'nin vardiyasini bul,
    yoksa branch fallback (paralel modda dogru shift'e baglar)

  ## Geriye uyumluluk
  Tek-vardiya modu (sequential) hala destekli — sadece UI tek vardiya gosterir,
  DB engellemesi yok (UNIQUE artik per-user oldugu icin engellemez).

  ## Idempotent
*/

-- 1) shifts_enabled toggle
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS shifts_enabled boolean NOT NULL DEFAULT false;

-- 2) UNIQUE index'i kullanici bazli yap
DROP INDEX IF EXISTS public.uq_shifts_one_open_per_branch;
CREATE UNIQUE INDEX IF NOT EXISTS uq_shifts_one_open_per_branch_user
  ON public.shifts(branch_id, opened_by)
  WHERE status = 'open' AND branch_id IS NOT NULL AND opened_by IS NOT NULL;

-- 3) start_shift — shift_no opsiyonel, kullanici bazli
DROP FUNCTION IF EXISTS public.start_shift(uuid, smallint, numeric, jsonb, text, text, text);

CREATE OR REPLACE FUNCTION public.start_shift(
  p_branch_id uuid,
  p_shift_no smallint DEFAULT NULL,
  p_opening_cash numeric DEFAULT 0,
  p_breakdown jsonb DEFAULT NULL,
  p_terminal_id text DEFAULT NULL,
  p_terminal_name text DEFAULT NULL,
  p_notes text DEFAULT NULL
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

  -- shift_no otomatik (saate gore)
  v_shift_no := p_shift_no;
  IF v_shift_no IS NULL THEN
    v_hour := EXTRACT(HOUR FROM now())::int;
    IF v_hour >= 6 AND v_hour < 14 THEN
      v_shift_no := 1;
    ELSIF v_hour >= 14 AND v_hour < 22 THEN
      v_shift_no := 2;
    ELSE
      v_shift_no := 3;
    END IF;
  END IF;

  -- Bu KULLANICININ acik vardiyasi var mi? (paralel mod)
  SELECT * INTO v_existing FROM public.shifts
  WHERE branch_id = p_branch_id
    AND opened_by = auth.uid()
    AND status = 'open'
  LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    RAISE EXCEPTION 'Zaten acik vardiyaniz var (#%)', v_existing.shift_no
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT * INTO v_def FROM public.shift_definitions
  WHERE branch_id = p_branch_id AND shift_no = v_shift_no
  LIMIT 1;

  v_business_date := public.compute_business_date(now());

  -- Gun kapali mi?
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

GRANT EXECUTE ON FUNCTION public.start_shift(uuid, smallint, numeric, jsonb, text, text, text) TO authenticated;

-- 4) my_active_shift RPC — kullanicinin kendi acik vardiyasi
CREATE OR REPLACE FUNCTION public.my_active_shift(p_branch_id uuid DEFAULT NULL)
RETURNS public.shifts AS $$
DECLARE
  v_row public.shifts%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.shifts
  WHERE opened_by = auth.uid()
    AND status = 'open'
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
  ORDER BY opened_at DESC
  LIMIT 1;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.my_active_shift(uuid) TO authenticated;

-- 5) log_payment_to_cash_register — paralel mod uyumlu
CREATE OR REPLACE FUNCTION public.log_payment_to_cash_register()
RETURNS TRIGGER AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_table public.restaurant_tables%ROWTYPE;
  v_branch_id uuid;
  v_shift_id uuid;
  v_creator uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;

  IF v_order.table_id IS NOT NULL THEN
    SELECT * INTO v_table FROM public.restaurant_tables WHERE id = v_order.table_id;
  END IF;

  v_branch_id := COALESCE(v_order.branch_id, v_table.branch_id);
  v_creator := COALESCE(NEW.created_by, v_order.created_by);

  -- 1) ONCE: payment'i yapan kullanicinin acik vardiyasi
  IF v_branch_id IS NOT NULL AND v_creator IS NOT NULL THEN
    SELECT id INTO v_shift_id
    FROM public.shifts
    WHERE branch_id = v_branch_id
      AND opened_by = v_creator
      AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;
  END IF;

  -- 2) Bulamadiysak (vardiya yok / sequential mod): branch'in herhangi acik vardiyasi
  IF v_shift_id IS NULL AND v_branch_id IS NOT NULL THEN
    SELECT id INTO v_shift_id
    FROM public.shifts
    WHERE branch_id = v_branch_id
      AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;
  END IF;

  INSERT INTO public.cash_register_transactions (
    tenant_id, transaction_type, payment_method, amount,
    reference_id, reference_type, description, order_number, table_name,
    created_at, created_by, branch_id, shift_id
  ) VALUES (
    NEW.tenant_id, 'order_payment', NEW.payment_method, NEW.amount,
    NEW.id, 'payment_transaction',
    CASE
      WHEN NEW.payment_method = 'cash' THEN 'Nakit Odeme'
      WHEN NEW.payment_method = 'credit_card' THEN 'Kredi Karti Odemesi'
      WHEN NEW.payment_method = 'open_account' THEN 'Acik Hesap Odemesi'
      ELSE 'Odeme'
    END,
    v_order.id::text, v_table.name,
    NEW.created_at, NEW.created_by, v_branch_id, v_shift_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';

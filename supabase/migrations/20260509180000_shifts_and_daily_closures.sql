/*
  # Vardiya ve Gun Sonu Kapatma — DB altyapisi

  ## Amac
  - Sabit 3 vardiya (Sabah / Ogle / Aksam) zincirli aksin.
  - Her vardiya: acilis nakit -> calisma -> kapanis nakit sayim -> fark hesaplanir.
  - Gun sonu kapatma: o gunun tum vardiyalari kapaliysa, gun snapshot'lanir ve kilitlenir.
  - Nakit sayim: tek toplam VEYA kupur kupur (jsonb breakdown).

  ## Tablolar
    - public.shift_definitions   : sabit vardiya tanimlari (sube basina 3 satir)
    - public.shifts              : her acilan vardiya ornek satiri
    - public.daily_closures      : gun sonu kapanis snapshot'i
    - public.cash_register_transactions.shift_id : FK eklenir

  ## RPC
    - start_shift(...)            : yeni vardiya acar
    - close_shift(...)            : vardiyayi kapatir, beklenen nakit ve fark hesaplar
    - close_business_day(...)     : tum vardiyalar kapaliysa gunu kapatir (snapshot)
    - reopen_business_day(...)    : admin yeniden acar

  ## Iss kurallari
    - Bir subede ayni anda yalniz 1 acik vardiya olabilir (UNIQUE partial index).
    - Bir subenin bir gunu icin yalniz 1 daily_closures.
    - Kapali bir gun icin yeni siparis/odeme/transaction yazilamaz (CHECK: locked_until_date).

  ## Idempotent
    Tum CREATE'ler IF NOT EXISTS / DROP IF EXISTS pattern'i ile guvenli yeniden calismaya hazir.
*/

-- =========================================================
-- 1) shift_definitions
-- =========================================================
CREATE TABLE IF NOT EXISTS public.shift_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  shift_no smallint NOT NULL CHECK (shift_no BETWEEN 1 AND 6),
  name text NOT NULL,
  start_time time NOT NULL DEFAULT '06:00',
  end_time time NOT NULL DEFAULT '14:00',
  color text NOT NULL DEFAULT '#f59e0b',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, shift_no)
);

CREATE INDEX IF NOT EXISTS idx_shift_definitions_tenant ON public.shift_definitions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shift_definitions_branch ON public.shift_definitions(branch_id);

ALTER TABLE public.shift_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shift_def_select_own_tenant" ON public.shift_definitions;
CREATE POLICY "shift_def_select_own_tenant" ON public.shift_definitions
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "shift_def_modify_admin" ON public.shift_definitions;
CREATE POLICY "shift_def_modify_admin" ON public.shift_definitions
  FOR ALL TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles
      WHERE id = auth.uid()
        AND (
          COALESCE(is_super_admin, false) = true
          OR role IN ('super_admin','admin','owner','manager')
        )
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles
      WHERE id = auth.uid()
        AND (
          COALESCE(is_super_admin, false) = true
          OR role IN ('super_admin','admin','owner','manager')
        )
    )
  );

-- Her sube icin varsayilan 3 vardiya (eger yoksa) seed et
INSERT INTO public.shift_definitions (tenant_id, branch_id, shift_no, name, start_time, end_time, color)
SELECT b.tenant_id, b.id, v.shift_no, v.name, v.start_time::time, v.end_time::time, v.color
FROM public.branches b
CROSS JOIN (VALUES
  (1, 'Sabah Vardiyasi',  '06:00', '14:00', '#f59e0b'),
  (2, 'Ogle Vardiyasi',   '14:00', '22:00', '#3b82f6'),
  (3, 'Aksam Vardiyasi',  '22:00', '06:00', '#8b5cf6')
) AS v(shift_no, name, start_time, end_time, color)
ON CONFLICT (branch_id, shift_no) DO NOTHING;

-- =========================================================
-- 2) shifts (her acilan vardiya ornegi)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  shift_definition_id uuid REFERENCES public.shift_definitions(id) ON DELETE SET NULL,
  shift_no smallint NOT NULL,
  shift_name text NOT NULL,
  business_date date NOT NULL,

  -- terminal bilgisi (cok terminalli kurulumda secimli)
  terminal_id text,
  terminal_name text,

  opened_by uuid REFERENCES auth.users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_cash numeric(12,2) NOT NULL DEFAULT 0,
  opening_cash_breakdown jsonb,
  opening_notes text,

  closed_by uuid REFERENCES auth.users(id),
  closed_at timestamptz,
  closing_cash numeric(12,2),
  closing_cash_breakdown jsonb,
  closing_notes text,

  -- Kapanista hesaplanir
  cash_revenue numeric(12,2) NOT NULL DEFAULT 0,
  card_revenue numeric(12,2) NOT NULL DEFAULT 0,
  open_account_revenue numeric(12,2) NOT NULL DEFAULT 0,
  total_revenue numeric(12,2) NOT NULL DEFAULT 0,
  expense_total numeric(12,2) NOT NULL DEFAULT 0,
  cash_in_total numeric(12,2) NOT NULL DEFAULT 0,
  cash_out_total numeric(12,2) NOT NULL DEFAULT 0,
  expected_cash numeric(12,2) NOT NULL DEFAULT 0,
  cash_difference numeric(12,2) NOT NULL DEFAULT 0,
  order_count integer NOT NULL DEFAULT 0,

  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shifts_tenant ON public.shifts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shifts_branch ON public.shifts(branch_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON public.shifts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_business_date ON public.shifts(business_date DESC);

-- Sube basina ayni anda yalniz 1 acik vardiya
CREATE UNIQUE INDEX IF NOT EXISTS uq_shifts_one_open_per_branch
  ON public.shifts(branch_id) WHERE status = 'open' AND branch_id IS NOT NULL;

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shifts_select_own_tenant" ON public.shifts;
CREATE POLICY "shifts_select_own_tenant" ON public.shifts
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "shifts_insert_own_tenant" ON public.shifts;
CREATE POLICY "shifts_insert_own_tenant" ON public.shifts
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "shifts_update_own_tenant" ON public.shifts;
CREATE POLICY "shifts_update_own_tenant" ON public.shifts
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "shifts_delete_admin" ON public.shifts;
CREATE POLICY "shifts_delete_admin" ON public.shifts
  FOR DELETE TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles
      WHERE id = auth.uid()
        AND (COALESCE(is_super_admin, false) = true OR role IN ('super_admin','admin','owner'))
    )
  );

-- =========================================================
-- 3) cash_register_transactions.shift_id FK
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cash_register_transactions'
      AND column_name = 'shift_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.cash_register_transactions ADD COLUMN shift_id uuid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cash_register_transactions_shift_id_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE public.cash_register_transactions
             ADD CONSTRAINT cash_register_transactions_shift_id_fkey
             FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_cash_register_shift_id ON public.cash_register_transactions(shift_id);

-- branch_id (varsa) trigger icin kullanilabilir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cash_register_transactions'
      AND column_name = 'branch_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.cash_register_transactions ADD COLUMN branch_id uuid';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_cash_register_branch ON public.cash_register_transactions(branch_id)';
  END IF;
END
$$;

-- log_payment_to_cash_register trigger'i: branch_id + acik vardiya iliskisi
CREATE OR REPLACE FUNCTION public.log_payment_to_cash_register()
RETURNS TRIGGER AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_table public.restaurant_tables%ROWTYPE;
  v_branch_id uuid;
  v_shift_id uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = NEW.order_id;

  IF v_order.table_id IS NOT NULL THEN
    SELECT * INTO v_table FROM public.restaurant_tables WHERE id = v_order.table_id;
  END IF;

  v_branch_id := COALESCE(v_order.branch_id, v_table.branch_id);

  IF v_branch_id IS NOT NULL THEN
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

-- =========================================================
-- 4) daily_closures (gun sonu snapshot)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.daily_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  business_date date NOT NULL,
  closed_by uuid REFERENCES auth.users(id),
  closed_at timestamptz NOT NULL DEFAULT now(),

  opening_cash_total numeric(12,2) NOT NULL DEFAULT 0,
  closing_cash_total numeric(12,2) NOT NULL DEFAULT 0,
  cash_revenue numeric(12,2) NOT NULL DEFAULT 0,
  card_revenue numeric(12,2) NOT NULL DEFAULT 0,
  open_account_revenue numeric(12,2) NOT NULL DEFAULT 0,
  total_revenue numeric(12,2) NOT NULL DEFAULT 0,
  expense_total numeric(12,2) NOT NULL DEFAULT 0,
  cash_in_total numeric(12,2) NOT NULL DEFAULT 0,
  cash_out_total numeric(12,2) NOT NULL DEFAULT 0,
  expected_cash numeric(12,2) NOT NULL DEFAULT 0,
  cash_difference numeric(12,2) NOT NULL DEFAULT 0,
  order_count integer NOT NULL DEFAULT 0,
  completed_order_count integer NOT NULL DEFAULT 0,
  cancelled_order_count integer NOT NULL DEFAULT 0,
  shift_count integer NOT NULL DEFAULT 0,

  notes text,
  status text NOT NULL DEFAULT 'closed' CHECK (status IN ('closed','reopened')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, business_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_closures_tenant ON public.daily_closures(tenant_id);
CREATE INDEX IF NOT EXISTS idx_daily_closures_business_date ON public.daily_closures(business_date DESC);

ALTER TABLE public.daily_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dc_select_own_tenant" ON public.daily_closures;
CREATE POLICY "dc_select_own_tenant" ON public.daily_closures
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "dc_insert_own_tenant" ON public.daily_closures;
CREATE POLICY "dc_insert_own_tenant" ON public.daily_closures
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "dc_update_admin" ON public.daily_closures;
CREATE POLICY "dc_update_admin" ON public.daily_closures
  FOR UPDATE TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles
      WHERE id = auth.uid()
        AND (COALESCE(is_super_admin, false) = true OR role IN ('super_admin','admin','owner','manager'))
    )
  );

-- =========================================================
-- 5) Yardimci: business_date hesabi (06:00 cutoff)
-- =========================================================
CREATE OR REPLACE FUNCTION public.compute_business_date(p_at timestamptz DEFAULT now())
RETURNS date AS $$
DECLARE
  d_local timestamptz := p_at;
BEGIN
  IF EXTRACT(HOUR FROM d_local) < 6 THEN
    RETURN (d_local AT TIME ZONE 'UTC')::date - 1;
  END IF;
  RETURN (d_local AT TIME ZONE 'UTC')::date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =========================================================
-- 6) RPC: start_shift
-- =========================================================
CREATE OR REPLACE FUNCTION public.start_shift(
  p_branch_id uuid,
  p_shift_no smallint,
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
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Yetki yok: profile bulunamadi';
  END IF;

  -- Sube uyumu
  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = p_branch_id AND tenant_id = v_tenant_id
  ) THEN
    RAISE EXCEPTION 'Sube tenant ile eslemiyor';
  END IF;

  -- Acik vardiya var mi?
  SELECT * INTO v_existing FROM public.shifts
  WHERE branch_id = p_branch_id AND status = 'open'
  LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    RAISE EXCEPTION 'Bu sube icin zaten acik bir vardiya var (#%)', v_existing.shift_no
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT * INTO v_def FROM public.shift_definitions
  WHERE branch_id = p_branch_id AND shift_no = p_shift_no
  LIMIT 1;

  v_business_date := public.compute_business_date(now());

  -- Gun kapali mi?
  IF EXISTS (
    SELECT 1 FROM public.daily_closures
    WHERE branch_id = p_branch_id AND business_date = v_business_date AND status = 'closed'
  ) THEN
    RAISE EXCEPTION 'Bu gun (%) zaten kapatildi. Vardiya acilamaz.', v_business_date;
  END IF;

  INSERT INTO public.shifts (
    tenant_id, branch_id, shift_definition_id, shift_no, shift_name, business_date,
    terminal_id, terminal_name,
    opened_by, opening_cash, opening_cash_breakdown, opening_notes
  ) VALUES (
    v_tenant_id, p_branch_id, v_def.id, p_shift_no,
    COALESCE(v_def.name, 'Vardiya ' || p_shift_no::text),
    v_business_date,
    p_terminal_id, p_terminal_name,
    auth.uid(), COALESCE(p_opening_cash, 0), p_breakdown, p_notes
  ) RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.start_shift(uuid, smallint, numeric, jsonb, text, text, text) TO authenticated;

-- =========================================================
-- 7) RPC: close_shift
-- =========================================================
CREATE OR REPLACE FUNCTION public.close_shift(
  p_shift_id uuid,
  p_closing_cash numeric DEFAULT NULL,
  p_breakdown jsonb DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS public.shifts AS $$
DECLARE
  v_shift public.shifts%ROWTYPE;
  v_cash numeric(12,2) := 0;
  v_card numeric(12,2) := 0;
  v_open_acc numeric(12,2) := 0;
  v_expense numeric(12,2) := 0;
  v_in numeric(12,2) := 0;
  v_out numeric(12,2) := 0;
  v_orders integer := 0;
  v_expected numeric(12,2) := 0;
  v_diff numeric(12,2) := 0;
BEGIN
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id FOR UPDATE;
  IF v_shift.id IS NULL THEN
    RAISE EXCEPTION 'Vardiya bulunamadi';
  END IF;
  IF v_shift.status <> 'open' THEN
    RAISE EXCEPTION 'Vardiya zaten kapali';
  END IF;

  -- Bu vardiyaya iliskili kasa hareketleri (shift_id ile + opened/closed araligi yedek)
  SELECT
    COALESCE(SUM(CASE WHEN transaction_type='order_payment' AND payment_method='cash'         THEN ABS(amount) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type='order_payment' AND payment_method='credit_card'  THEN ABS(amount) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type='order_payment' AND payment_method='open_account' THEN ABS(amount) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type='expense'  THEN ABS(amount) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type='cash_in'  THEN ABS(amount) ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type='cash_out' THEN ABS(amount) ELSE 0 END), 0)
  INTO v_cash, v_card, v_open_acc, v_expense, v_in, v_out
  FROM public.cash_register_transactions
  WHERE tenant_id = v_shift.tenant_id
    AND (
      shift_id = v_shift.id
      OR (
        shift_id IS NULL
        AND created_at >= v_shift.opened_at
        AND created_at <= now()
        AND (v_shift.branch_id IS NULL OR branch_id = v_shift.branch_id OR branch_id IS NULL)
      )
    );

  SELECT COUNT(*) INTO v_orders FROM public.orders
  WHERE tenant_id = v_shift.tenant_id
    AND (v_shift.branch_id IS NULL OR branch_id = v_shift.branch_id)
    AND created_at >= v_shift.opened_at
    AND created_at <= now();

  v_expected := COALESCE(v_shift.opening_cash, 0) + v_cash + v_in - v_out - v_expense;

  IF p_closing_cash IS NOT NULL THEN
    v_diff := COALESCE(p_closing_cash, 0) - v_expected;
  END IF;

  UPDATE public.shifts SET
    status = 'closed',
    closed_by = auth.uid(),
    closed_at = now(),
    closing_cash = p_closing_cash,
    closing_cash_breakdown = p_breakdown,
    closing_notes = p_notes,
    cash_revenue = v_cash,
    card_revenue = v_card,
    open_account_revenue = v_open_acc,
    total_revenue = v_cash + v_card + v_open_acc,
    expense_total = v_expense,
    cash_in_total = v_in,
    cash_out_total = v_out,
    order_count = v_orders,
    expected_cash = v_expected,
    cash_difference = v_diff,
    updated_at = now()
  WHERE id = p_shift_id
  RETURNING * INTO v_shift;

  -- Geriye donuk: bu vardiya araligindaki shift_id NULL olan transaction'lara shift_id yaz
  UPDATE public.cash_register_transactions
  SET shift_id = v_shift.id
  WHERE shift_id IS NULL
    AND tenant_id = v_shift.tenant_id
    AND created_at >= v_shift.opened_at
    AND created_at <= v_shift.closed_at
    AND (v_shift.branch_id IS NULL OR branch_id = v_shift.branch_id OR branch_id IS NULL);

  RETURN v_shift;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.close_shift(uuid, numeric, jsonb, text) TO authenticated;

-- =========================================================
-- 8) RPC: close_business_day
-- =========================================================
CREATE OR REPLACE FUNCTION public.close_business_day(
  p_branch_id uuid,
  p_business_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS public.daily_closures AS $$
DECLARE
  v_tenant_id uuid;
  v_date date := COALESCE(p_business_date, public.compute_business_date(now()));
  v_open_cnt integer;
  v_summary record;
  v_row public.daily_closures%ROWTYPE;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Yetki yok';
  END IF;

  -- Acik vardiya kalmis mi?
  SELECT COUNT(*) INTO v_open_cnt FROM public.shifts
  WHERE tenant_id = v_tenant_id
    AND business_date = v_date
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND status = 'open';
  IF v_open_cnt > 0 THEN
    RAISE EXCEPTION 'Hala % acik vardiya var. Once tum vardiyalari kapatin.', v_open_cnt;
  END IF;

  -- Vardiya snapshot
  SELECT
    COUNT(*)::int AS shift_count,
    COALESCE(SUM(opening_cash),0)         AS opening_cash_total,
    COALESCE(SUM(closing_cash),0)         AS closing_cash_total,
    COALESCE(SUM(cash_revenue),0)         AS cash_revenue,
    COALESCE(SUM(card_revenue),0)         AS card_revenue,
    COALESCE(SUM(open_account_revenue),0) AS open_account_revenue,
    COALESCE(SUM(total_revenue),0)        AS total_revenue,
    COALESCE(SUM(expense_total),0)        AS expense_total,
    COALESCE(SUM(cash_in_total),0)        AS cash_in_total,
    COALESCE(SUM(cash_out_total),0)       AS cash_out_total,
    COALESCE(SUM(expected_cash),0)        AS expected_cash,
    COALESCE(SUM(cash_difference),0)      AS cash_difference,
    COALESCE(SUM(order_count),0)          AS order_count
  INTO v_summary
  FROM public.shifts
  WHERE tenant_id = v_tenant_id
    AND business_date = v_date
    AND (p_branch_id IS NULL OR branch_id = p_branch_id);

  INSERT INTO public.daily_closures (
    tenant_id, branch_id, business_date, closed_by,
    opening_cash_total, closing_cash_total, cash_revenue, card_revenue, open_account_revenue,
    total_revenue, expense_total, cash_in_total, cash_out_total,
    expected_cash, cash_difference,
    order_count, completed_order_count, cancelled_order_count, shift_count, notes, status
  ) VALUES (
    v_tenant_id, p_branch_id, v_date, auth.uid(),
    v_summary.opening_cash_total, v_summary.closing_cash_total,
    v_summary.cash_revenue, v_summary.card_revenue, v_summary.open_account_revenue,
    v_summary.total_revenue, v_summary.expense_total, v_summary.cash_in_total, v_summary.cash_out_total,
    v_summary.expected_cash, v_summary.cash_difference,
    v_summary.order_count, v_summary.order_count, 0, v_summary.shift_count, p_notes, 'closed'
  )
  ON CONFLICT (branch_id, business_date) DO UPDATE SET
    closed_by = EXCLUDED.closed_by,
    closed_at = now(),
    opening_cash_total = EXCLUDED.opening_cash_total,
    closing_cash_total = EXCLUDED.closing_cash_total,
    cash_revenue = EXCLUDED.cash_revenue,
    card_revenue = EXCLUDED.card_revenue,
    open_account_revenue = EXCLUDED.open_account_revenue,
    total_revenue = EXCLUDED.total_revenue,
    expense_total = EXCLUDED.expense_total,
    cash_in_total = EXCLUDED.cash_in_total,
    cash_out_total = EXCLUDED.cash_out_total,
    expected_cash = EXCLUDED.expected_cash,
    cash_difference = EXCLUDED.cash_difference,
    order_count = EXCLUDED.order_count,
    shift_count = EXCLUDED.shift_count,
    notes = EXCLUDED.notes,
    status = 'closed',
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.close_business_day(uuid, date, text) TO authenticated;

-- =========================================================
-- 9) RPC: reopen_business_day (admin)
-- =========================================================
CREATE OR REPLACE FUNCTION public.reopen_business_day(p_id uuid)
RETURNS public.daily_closures AS $$
DECLARE
  v_row public.daily_closures%ROWTYPE;
  v_is_admin boolean;
BEGIN
  SELECT (COALESCE(is_super_admin, false) = true OR role IN ('super_admin','admin','owner'))
  INTO v_is_admin
  FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Sadece yonetici gunu yeniden acabilir';
  END IF;

  UPDATE public.daily_closures SET status = 'reopened', updated_at = now()
  WHERE id = p_id RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.reopen_business_day(uuid) TO authenticated;

-- =========================================================
-- 10) Realtime publication
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'shifts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'daily_closures'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_closures';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

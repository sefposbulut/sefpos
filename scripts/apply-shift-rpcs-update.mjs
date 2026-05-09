// One-shot: align start_shift / close_business_day with branch-aware
// compute_business_date AND ensure get_current_business_date exists.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, '..', '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }),
);

const url = env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL missing'); process.exit(1); }

const SQL = `
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig FROM pg_proc
    WHERE proname IN ('start_shift','close_business_day')
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.start_shift(
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

CREATE OR REPLACE FUNCTION public.close_business_day(
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
`;

const cleanUrl = url.replace(/[?&]sslmode=[^&]*/g, '').replace(/[?&]uselibpqcompat=[^&]*/g, '');
const client = new pg.Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  await client.query(SQL);
  const r = await client.query(`
    SELECT proname FROM pg_proc
    WHERE proname IN ('start_shift','close_business_day','compute_business_date','get_current_business_date','cleanup_orphan_pending_orders')
    ORDER BY proname
  `);
  console.log('Procs in DB:', r.rows.map(x => x.proname));
  console.log('OK');
} catch (e) {
  console.error('FAILED:', e.message || e);
  process.exitCode = 1;
} finally {
  await client.end();
}

-- close_business_day: shifts tablosunda total_cash/total_card yok; dogru kolonlarla ozet.

DROP FUNCTION IF EXISTS public.close_business_day(uuid, date, text);

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
    COUNT(*)::int AS shift_count,
    COALESCE(SUM(s.opening_cash), 0) AS opening_cash_total,
    COALESCE(SUM(s.closing_cash), 0) AS closing_cash_total,
    COALESCE(SUM(s.cash_revenue), 0) AS cash_revenue,
    COALESCE(SUM(s.card_revenue), 0) AS card_revenue,
    COALESCE(SUM(s.open_account_revenue), 0) AS open_account_revenue,
    COALESCE(SUM(s.total_revenue), 0) AS total_revenue,
    COALESCE(SUM(s.expense_total), 0) AS expense_total,
    COALESCE(SUM(s.cash_in_total), 0) AS cash_in_total,
    COALESCE(SUM(s.cash_out_total), 0) AS cash_out_total,
    COALESCE(SUM(s.expected_cash), 0) AS expected_cash,
    COALESCE(SUM(s.cash_difference), 0) AS cash_difference,
    COALESCE(SUM(s.order_count), 0) AS order_count
  INTO v_summary
  FROM public.shifts s
  WHERE s.tenant_id = v_tenant_id
    AND s.business_date = v_date
    AND (p_branch_id IS NULL OR s.branch_id = p_branch_id);

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
$$;

GRANT EXECUTE ON FUNCTION public.close_business_day(uuid, date, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

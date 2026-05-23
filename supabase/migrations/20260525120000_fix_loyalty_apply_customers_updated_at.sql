-- customers tablosunda updated_at yok; loyalty_apply_for_order düzeltmesi

CREATE OR REPLACE FUNCTION public.loyalty_apply_for_order(
  p_customer_id uuid,
  p_order_id uuid,
  p_paid_tl numeric,
  p_redeem_points integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_settings public.loyalty_settings%ROWTYPE;
  v_cust public.customers%ROWTYPE;
  v_redeem_pts integer := GREATEST(0, COALESCE(p_redeem_points, 0));
  v_discount_tl numeric(10,2) := 0;
  v_earn_base numeric(10,2);
  v_earn_pts integer := 0;
  v_max_redeem integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Oturum gerekli');
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE id = v_uid LIMIT 1;
  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tenant bulunamadı');
  END IF;

  SELECT * INTO v_settings FROM public.loyalty_settings WHERE tenant_id = v_tenant;
  IF NOT FOUND THEN
    INSERT INTO public.loyalty_settings (tenant_id) VALUES (v_tenant)
    RETURNING * INTO v_settings;
  END IF;

  IF NOT v_settings.enabled THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'disabled');
  END IF;

  SELECT * INTO v_cust
  FROM public.customers
  WHERE id = p_customer_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Müşteri bulunamadı');
  END IF;

  IF v_redeem_pts > 0 THEN
    IF v_redeem_pts < v_settings.min_redeem_points THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', format('En az %s puan kullanılabilir', v_settings.min_redeem_points)
      );
    END IF;
    IF v_redeem_pts > COALESCE(v_cust.loyalty_points, 0) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Yetersiz puan');
    END IF;
    v_max_redeem := FLOOR(COALESCE(p_paid_tl, 0) / NULLIF(v_settings.redeem_tl_per_point, 0))::integer;
    IF v_max_redeem IS NOT NULL AND v_redeem_pts > v_max_redeem THEN
      v_redeem_pts := v_max_redeem;
    END IF;
    IF v_redeem_pts <= 0 THEN
      v_discount_tl := 0;
    ELSE
      v_discount_tl := ROUND((v_redeem_pts * v_settings.redeem_tl_per_point)::numeric, 2);
      IF v_discount_tl > COALESCE(p_paid_tl, 0) THEN
        v_discount_tl := COALESCE(p_paid_tl, 0);
        v_redeem_pts := FLOOR(v_discount_tl / NULLIF(v_settings.redeem_tl_per_point, 0))::integer;
      END IF;
    END IF;
  END IF;

  IF v_redeem_pts > 0 THEN
    UPDATE public.customers
    SET loyalty_points = GREATEST(0, loyalty_points - v_redeem_pts)
    WHERE id = p_customer_id;

    INSERT INTO public.loyalty_transactions (
      tenant_id, customer_id, order_id, type, points_delta, tl_amount, note, created_by
    ) VALUES (
      v_tenant, p_customer_id, p_order_id, 'redeem', -v_redeem_pts, v_discount_tl,
      'Siparişte puan kullanımı', v_uid
    );
  END IF;

  v_earn_base := GREATEST(0, COALESCE(p_paid_tl, 0) - v_discount_tl);
  IF v_settings.spend_tl_for_one_point > 0 THEN
    v_earn_pts := FLOOR(v_earn_base / v_settings.spend_tl_for_one_point)::integer;
  END IF;

  IF v_earn_pts > 0 THEN
    UPDATE public.customers
    SET loyalty_points = loyalty_points + v_earn_pts
    WHERE id = p_customer_id;

    INSERT INTO public.loyalty_transactions (
      tenant_id, customer_id, order_id, type, points_delta, tl_amount, note, created_by
    ) VALUES (
      v_tenant, p_customer_id, p_order_id, 'earn', v_earn_pts, v_earn_base,
      'Siparişten puan kazanımı', v_uid
    );
  END IF;

  IF p_order_id IS NOT NULL THEN
    UPDATE public.orders
    SET customer_id = COALESCE(customer_id, p_customer_id)
    WHERE id = p_order_id AND tenant_id = v_tenant;
  END IF;

  SELECT loyalty_points INTO v_cust.loyalty_points FROM public.customers WHERE id = p_customer_id;

  RETURN jsonb_build_object(
    'ok', true,
    'discount_tl', v_discount_tl,
    'points_redeemed', v_redeem_pts,
    'points_earned', v_earn_pts,
    'new_balance', v_cust.loyalty_points
  );
END;
$$;

REVOKE ALL ON FUNCTION public.loyalty_apply_for_order(uuid, uuid, numeric, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.loyalty_apply_for_order(uuid, uuid, numeric, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

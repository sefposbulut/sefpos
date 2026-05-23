-- Sadakat modülü: müşteri puanı, ayarlar, hareketler, sipariş sonrası atomik işlem

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS loyalty_points integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.loyalty_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  /** Harcama: bu TL tutarına 1 puan (ör. 10 → her 10 TL = 1 puan) */
  spend_tl_for_one_point numeric(10,2) NOT NULL DEFAULT 10,
  /** Kullanım: 1 puan kaç TL indirim (ör. 0.10 → 100 puan = 10 TL) */
  redeem_tl_per_point numeric(10,4) NOT NULL DEFAULT 0.10,
  min_redeem_points integer NOT NULL DEFAULT 20,
  welcome_bonus_points integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('earn', 'redeem', 'adjust', 'welcome')),
  points_delta integer NOT NULL,
  tl_amount numeric(10,2),
  note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_tx_tenant_created
  ON public.loyalty_transactions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_customer
  ON public.loyalty_transactions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_loyalty_points
  ON public.customers(tenant_id, loyalty_points DESC);

ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loyalty_settings_tenant_select ON public.loyalty_settings;
CREATE POLICY loyalty_settings_tenant_select ON public.loyalty_settings
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS loyalty_settings_tenant_write ON public.loyalty_settings;
CREATE POLICY loyalty_settings_tenant_write ON public.loyalty_settings
  FOR ALL TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin', 'manager', 'sahip')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin', 'manager', 'sahip')
    )
  );

DROP POLICY IF EXISTS loyalty_tx_tenant_select ON public.loyalty_transactions;
CREATE POLICY loyalty_tx_tenant_select ON public.loyalty_transactions
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS loyalty_tx_tenant_insert ON public.loyalty_transactions;
CREATE POLICY loyalty_tx_tenant_insert ON public.loyalty_transactions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

-- Tamamlanan siparişte puan kullan + kazan (tek transaction)
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

COMMENT ON FUNCTION public.loyalty_apply_for_order IS
  'Ödeme tamamlandığında sadakat puanı kullan/kazan; indirim TL döner.';

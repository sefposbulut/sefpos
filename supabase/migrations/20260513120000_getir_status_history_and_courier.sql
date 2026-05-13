-- Getir / online sipariş: durum geçmişi, webhook idempotency, kurye alanları
-- (ŞefPOS — GetirYemek webhook senkronu)

-- ─── online_orders: platform string durumu + kurye ─────────────────────────
ALTER TABLE public.online_orders
  ADD COLUMN IF NOT EXISTS getir_platform_order_status text;

ALTER TABLE public.online_orders
  ADD COLUMN IF NOT EXISTS getir_courier_name text;

ALTER TABLE public.online_orders
  ADD COLUMN IF NOT EXISTS getir_courier_phone text;

ALTER TABLE public.online_orders
  ADD COLUMN IF NOT EXISTS getir_courier_pickup_at timestamptz;

COMMENT ON COLUMN public.online_orders.getir_platform_order_status IS
  'GetirYemek webhook/API string enum (örn. NEW_ORDER, CONFIRMED). Bilinmeyen değerler ham saklanır.';

-- ─── Webhook idempotency (aynı event iki kez işlenmez) ─────────────────────
CREATE TABLE IF NOT EXISTS public.getir_webhook_event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id uuid NOT NULL REFERENCES public.online_order_platforms(id) ON DELETE CASCADE,
  platform_order_id text NOT NULL,
  dedupe_key text NOT NULL,
  raw_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_getir_webhook_log_platform_order
  ON public.getir_webhook_event_log(platform_id, platform_order_id, created_at DESC);

ALTER TABLE public.getir_webhook_event_log ENABLE ROW LEVEL SECURITY;

-- RLS açık; authenticated için politika yok (yalnızca service_role edge yazar/okur).
CREATE TABLE IF NOT EXISTS public.online_order_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  online_order_id uuid NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  getir_platform_order_status text,
  getir_status_code int,
  source text NOT NULL DEFAULT 'webhook',
  event_payload jsonb,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (online_order_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_online_order_status_events_tenant
  ON public.online_order_status_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_online_order_status_events_order
  ON public.online_order_status_events(online_order_id, created_at DESC);

ALTER TABLE public.online_order_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members read status events" ON public.online_order_status_events;
CREATE POLICY "Tenant members read status events"
  ON public.online_order_status_events FOR SELECT TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

-- Realtime: sipariş satırı zaten yayında; geçmiş opsiyonel (şimdilik kapalı).

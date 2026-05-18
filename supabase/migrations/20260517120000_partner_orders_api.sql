/*
  # ŞefPOS — Kurumsal dış partner REST API (paket/teslimat siparişleri)

  Her entegrasyon firması (HemenYolda, kurye platformu vb.) için ayrı API anahtarı.
  Edge function: partner-orders-api
*/

CREATE TABLE IF NOT EXISTS public.partner_api_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  partner_name text NOT NULL,
  partner_reference text,
  api_key text NOT NULL,
  api_key_prefix text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_api_clients_api_key_unique UNIQUE (api_key),
  CONSTRAINT partner_api_clients_api_key_prefix_chk CHECK (char_length(api_key_prefix) >= 8)
);

CREATE INDEX IF NOT EXISTS idx_partner_api_clients_tenant
  ON public.partner_api_clients(tenant_id);

CREATE INDEX IF NOT EXISTS idx_partner_api_clients_active_key
  ON public.partner_api_clients(api_key)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.partner_api_order_acks (
  client_id uuid NOT NULL REFERENCES public.partner_api_clients(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  acked_at timestamptz NOT NULL DEFAULT now(),
  ack_source text DEFAULT 'api',
  PRIMARY KEY (client_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_api_order_acks_order
  ON public.partner_api_order_acks(order_id);

ALTER TABLE public.partner_api_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_api_order_acks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant users view partner api clients" ON public.partner_api_clients;
CREATE POLICY "Tenant users view partner api clients"
  ON public.partner_api_clients FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Tenant admins manage partner api clients" ON public.partner_api_clients;
CREATE POLICY "Tenant admins manage partner api clients"
  ON public.partner_api_clients FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = partner_api_clients.tenant_id
        AND p.role IN ('admin', 'owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = partner_api_clients.tenant_id
        AND p.role IN ('admin', 'owner', 'manager')
    )
  );

DROP POLICY IF EXISTS "Tenant users view partner api acks" ON public.partner_api_order_acks;
CREATE POLICY "Tenant users view partner api acks"
  ON public.partner_api_order_acks FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT c.id FROM public.partner_api_clients c
      WHERE c.tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Tenant admins manage partner api acks" ON public.partner_api_order_acks;
CREATE POLICY "Tenant admins manage partner api acks"
  ON public.partner_api_order_acks FOR ALL
  TO authenticated
  USING (
    client_id IN (
      SELECT c.id FROM public.partner_api_clients c
      WHERE c.tenant_id IN (
        SELECT p.tenant_id FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'owner', 'manager')
      )
    )
  )
  WITH CHECK (
    client_id IN (
      SELECT c.id FROM public.partner_api_clients c
      WHERE c.tenant_id IN (
        SELECT p.tenant_id FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'owner', 'manager')
      )
    )
  );

COMMENT ON TABLE public.partner_api_clients IS 'Dış firmaların ŞefPOS paket sipariş API anahtarları (HemenYolda vb.).';
COMMENT ON TABLE public.partner_api_order_acks IS 'Partner tarafından alındı işaretlenen siparişler.';

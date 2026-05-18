/*
  # HemenYolda outbound webhook (ŞefPOS → HemenYolda POST)

  https://hemenyolda.com/api/integration/{app_name}/new-order|updated-order|canceled-order
*/

CREATE TABLE IF NOT EXISTS public.henemyolda_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  app_name text NOT NULL DEFAULT 'test-pos',
  access_token text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  is_test_mode boolean NOT NULL DEFAULT true,
  base_url text NOT NULL DEFAULT 'https://hemenyolda.com',
  last_push_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hemenyolda_integrations_tenant_branch_unique UNIQUE (tenant_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_henemyolda_integrations_tenant
  ON public.henemyolda_integrations(tenant_id);

CREATE TABLE IF NOT EXISTS public.henemyolda_webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.henemyolda_integrations(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('new', 'update', 'cancel')),
  http_status int,
  success boolean NOT NULL DEFAULT false,
  error_message text,
  request_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_henemyolda_webhook_log_new_success
  ON public.henemyolda_webhook_log(integration_id, order_id)
  WHERE action = 'new' AND success = true;

CREATE INDEX IF NOT EXISTS idx_henemyolda_webhook_log_order
  ON public.henemyolda_webhook_log(order_id);

ALTER TABLE public.henemyolda_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.henemyolda_webhook_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant view hemenyolda integrations" ON public.henemyolda_integrations;
CREATE POLICY "Tenant view hemenyolda integrations"
  ON public.henemyolda_integrations FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Tenant admins manage hemenyolda integrations" ON public.henemyolda_integrations;
CREATE POLICY "Tenant admins manage hemenyolda integrations"
  ON public.henemyolda_integrations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = tenant_id
        AND p.role IN ('admin', 'owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = tenant_id
        AND p.role IN ('admin', 'owner', 'manager')
    )
  );

DROP POLICY IF EXISTS "Tenant view hemenyolda webhook log" ON public.henemyolda_webhook_log;
CREATE POLICY "Tenant view hemenyolda webhook log"
  ON public.henemyolda_webhook_log FOR SELECT
  TO authenticated
  USING (
    integration_id IN (
      SELECT hi.id FROM public.henemyolda_integrations hi
      WHERE hi.tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    )
  );

COMMENT ON TABLE public.henemyolda_integrations IS 'HemenYolda webhook: app_name + Bearer token, aktif şube/tenant.';
COMMENT ON TABLE public.henemyolda_webhook_log IS 'HemenYolda webhook gönderim logu (tekrar gönderim önleme).';

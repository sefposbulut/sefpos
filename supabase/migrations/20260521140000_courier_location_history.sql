-- Kurye rota geçmişi (canlı harita çizgisi + paket eşlemesi)
CREATE TABLE IF NOT EXISTS public.courier_location_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  courier_id uuid NOT NULL REFERENCES public.couriers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courier_location_history_courier_time
  ON public.courier_location_history (courier_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_courier_location_history_order
  ON public.courier_location_history (order_id, created_at DESC)
  WHERE order_id IS NOT NULL;

ALTER TABLE public.courier_location_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read courier location history"
  ON public.courier_location_history FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id_direct());

CREATE POLICY "Couriers insert own location history anon"
  ON public.courier_location_history FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Couriers read own location history anon"
  ON public.courier_location_history FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Tenant members insert courier location history"
  ON public.courier_location_history FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id_direct());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'courier_location_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.courier_location_history;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'couriers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.couriers;
  END IF;
END $$;

ALTER TABLE public.courier_location_history REPLICA IDENTITY FULL;

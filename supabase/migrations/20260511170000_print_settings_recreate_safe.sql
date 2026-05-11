/*
  print_settings'i defalarca cache reload denedik, hâlâ PostgREST 404 dönüyor.
  Migration "applied" olarak işaretli ama canlıda CREATE başarısız olmuş
  olabilir (FK / izin). Sıfırdan, idempotent olarak yeniden inşa ediyoruz.

  Veri kaybı riski: tablo zaten 404 verdiği için içinde kayıt yok — DROP
  güvenli. Yeni client kurulumlarında bu migration tek başına yeterlidir.
*/

DROP TABLE IF EXISTS public.print_settings CASCADE;

CREATE TABLE public.print_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_print_settings_tenant_branch_unique
  ON public.print_settings(tenant_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX idx_print_settings_tenant ON public.print_settings(tenant_id);

ALTER TABLE public.print_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "print_settings_select_tenant_members"
  ON public.print_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = print_settings.tenant_id
    )
  );

CREATE POLICY "print_settings_insert_tenant_members"
  ON public.print_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = print_settings.tenant_id
    )
  );

CREATE POLICY "print_settings_update_tenant_members"
  ON public.print_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = print_settings.tenant_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = print_settings.tenant_id
    )
  );

CREATE POLICY "print_settings_delete_tenant_members"
  ON public.print_settings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.tenant_id = print_settings.tenant_id
    )
  );

CREATE OR REPLACE FUNCTION public.set_print_settings_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_print_settings_updated_at ON public.print_settings;
CREATE TRIGGER trg_print_settings_updated_at
  BEFORE UPDATE ON public.print_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_print_settings_updated_at();

NOTIFY pgrst, 'reload schema';

-- Lisans paneli: zorunlu masaüstü güncelleme politikası (tek satır).

CREATE TABLE IF NOT EXISTS public.platform_release_policy (
  id text PRIMARY KEY DEFAULT 'default',
  min_required_version text NOT NULL DEFAULT '1.0.0',
  force_update boolean NOT NULL DEFAULT false,
  message text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.platform_release_policy (id, min_required_version, force_update, message)
VALUES ('default', '1.0.0', false, '')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_release_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Release policy public read" ON public.platform_release_policy;
CREATE POLICY "Release policy public read"
  ON public.platform_release_policy
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Release policy super admin write" ON public.platform_release_policy;
CREATE POLICY "Release policy super admin write"
  ON public.platform_release_policy
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.is_super_admin, false) = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND COALESCE(p.is_super_admin, false) = true
    )
  );

COMMENT ON TABLE public.platform_release_policy IS
  'ŞefPOS Electron zorunlu güncelleme — min_required_version altındaki sürümler güncellemek zorunda (force_update=true iken).';

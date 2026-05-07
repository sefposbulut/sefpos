-- ŞefPOS QR Menü v2: logo storage, tema, garson çağırma
-- 1) Storage bucket: tenant-assets (public read, authenticated owner write)
-- 2) waiter_calls tablosu (anon insert / tenant authenticated select-update)
-- 3) tenants.menu_theme JSON şeması belgelendirildi

BEGIN;

-- ============================================================
-- 1) Storage bucket: tenant-assets
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tenant-assets',
  'tenant-assets',
  TRUE,
  5242880, -- 5 MB
  ARRAY['image/png','image/jpeg','image/webp','image/svg+xml','image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Anon role: SELECT (public read URL'leri)
DROP POLICY IF EXISTS "tenant-assets public read" ON storage.objects;
CREATE POLICY "tenant-assets public read"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'tenant-assets');

-- Authenticated: kendi tenant klasörüne yaz/güncelle/sil
-- Yol şeması: <tenant_id>/<dosya>  (ör. 11111111.../logo.png)
DROP POLICY IF EXISTS "tenant-assets authenticated upload" ON storage.objects;
CREATE POLICY "tenant-assets authenticated upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-assets'
    AND (storage.foldername(name))[1] = COALESCE(public.get_my_tenant_id()::text, '')
  );

DROP POLICY IF EXISTS "tenant-assets authenticated update" ON storage.objects;
CREATE POLICY "tenant-assets authenticated update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tenant-assets'
    AND (storage.foldername(name))[1] = COALESCE(public.get_my_tenant_id()::text, '')
  );

DROP POLICY IF EXISTS "tenant-assets authenticated delete" ON storage.objects;
CREATE POLICY "tenant-assets authenticated delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'tenant-assets'
    AND (storage.foldername(name))[1] = COALESCE(public.get_my_tenant_id()::text, '')
  );

-- ============================================================
-- 2) waiter_calls — Garson çağırma
-- ============================================================
CREATE TABLE IF NOT EXISTS public.waiter_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  table_label TEXT NOT NULL DEFAULT '',
  call_type TEXT NOT NULL DEFAULT 'service' CHECK (call_type IN ('service','bill','water','help')),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','seen','resolved','cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID
);

-- Hızlı listeleme için (panelde son 24 saat / pending için)
CREATE INDEX IF NOT EXISTS idx_waiter_calls_branch_status
  ON public.waiter_calls(branch_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waiter_calls_tenant
  ON public.waiter_calls(tenant_id, created_at DESC);

-- FK'ler (varsa)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tenants')
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE table_schema='public' AND table_name='waiter_calls' AND constraint_name='waiter_calls_tenant_fk'
     ) THEN
    ALTER TABLE public.waiter_calls
      ADD CONSTRAINT waiter_calls_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='branches')
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE table_schema='public' AND table_name='waiter_calls' AND constraint_name='waiter_calls_branch_fk'
     ) THEN
    ALTER TABLE public.waiter_calls
      ADD CONSTRAINT waiter_calls_branch_fk
      FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;
  END IF;
END$$;

-- RLS
ALTER TABLE public.waiter_calls ENABLE ROW LEVEL SECURITY;

-- ANON: yalnızca INSERT (QR menü → public). Branch_id şube doğrulamasıyla,
-- kendi branch'inin tenant_id'si ile tutarlılığını trigger sağlasın.
DROP POLICY IF EXISTS "waiter_calls anon insert" ON public.waiter_calls;
CREATE POLICY "waiter_calls anon insert"
  ON public.waiter_calls FOR INSERT TO anon
  WITH CHECK (
    tenant_id IS NOT NULL
    AND branch_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = waiter_calls.branch_id
        AND b.tenant_id = waiter_calls.tenant_id
        AND b.is_active = TRUE
        AND COALESCE(b.menu_enabled, TRUE) = TRUE
    )
  );

-- TENANT KULLANICILARI: SELECT/UPDATE — sadece kendi tenant'larındaki
DROP POLICY IF EXISTS "waiter_calls tenant select" ON public.waiter_calls;
CREATE POLICY "waiter_calls tenant select"
  ON public.waiter_calls FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "waiter_calls tenant update" ON public.waiter_calls;
CREATE POLICY "waiter_calls tenant update"
  ON public.waiter_calls FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "waiter_calls tenant delete" ON public.waiter_calls;
CREATE POLICY "waiter_calls tenant delete"
  ON public.waiter_calls FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- GRANT (RLS varken bile gerekli)
GRANT INSERT ON public.waiter_calls TO anon;
GRANT SELECT, UPDATE, DELETE ON public.waiter_calls TO authenticated;

-- Realtime (POS panelde anlık çağrı görmek için)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='waiter_calls'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.waiter_calls;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
END$$;

-- ============================================================
-- 3) tenants.menu_theme — şema dokümantasyonu (kolon zaten var)
-- {
--   "primary":  "#0F172A",
--   "accent":   "#F97316",
--   "mode":     "light" | "dark",
--   "heroStyle":"gradient" | "image",
--   "heroImageUrl": "...optional...",
--   "fontStyle":"modern" | "elegant" | "casual"
-- }
-- ============================================================

COMMIT;

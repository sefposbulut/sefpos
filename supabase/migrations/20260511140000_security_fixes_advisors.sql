/*
  # Supabase Advisors güvenlik düzeltmeleri (P0)

  Database Linter şunları kritik düzeyinde işaretledi:

  1. `public.license_admin_credentials` — RLS kapalı, public schema'da, password
     hash içeriyor. Anon (anon key) ile okunabilir durumda. Bu tablo yalnızca
     server-side / service_role erişimine açılır. Tüm `anon` ve `authenticated`
     rollerden tüm yetkiler kaldırılır, RLS açılır ve hiçbir politika
     tanımlanmaz (default deny).

  2. `public.tenant_licenses` — RLS kapalı, license_key sızdırılabilir. Yalnızca
     ilgili tenant'ın owner/manager rolleri kendi tenant'ının license kayıtlarını
     görebilmeli. Anon tamamen kapatılır.

  3. `public.active_order_items` — VIEW SECURITY DEFINER (varsayılan) ile
     oluşturulduğu için sorgulayan kullanıcının RLS'ini bypass ediyor; tenant
     izolasyonu kırılma riski var. Postgres 15+ özelliği `security_invoker`'ı
     açıyoruz; artık view sorgulayan kullanıcının yetkisi ile çalışır ve alt
     tablolardaki RLS politikaları geçerli olur.

  Ek tedbir: aynı migration dosyasındaki `support_tickets` advisor uyarısı
  vermese de güvenli olduğundan emin olmak için RLS açıyoruz; sadece tenant
  üyeleri kendi ticket'larını görebilir.
*/

-- ─────────────────────────────────────────────────────────────────────────
-- 1) license_admin_credentials — service_role only
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.license_admin_credentials ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.license_admin_credentials FROM PUBLIC;
REVOKE ALL ON public.license_admin_credentials FROM anon;
REVOKE ALL ON public.license_admin_credentials FROM authenticated;

DROP POLICY IF EXISTS "license_admin_credentials_no_access" ON public.license_admin_credentials;

COMMENT ON TABLE public.license_admin_credentials IS
  'Lisans yönetim paneli admin hesapları. ASLA anon/authenticated tarafından okunmamalı; sadece service_role veya backend Edge Function üzerinden erişilir.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2) tenant_licenses — sadece tenant owner/manager kendi license'ini görsün
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenant_licenses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tenant_licenses FROM anon;

DROP POLICY IF EXISTS "tenant_licenses_select_owner" ON public.tenant_licenses;
CREATE POLICY "tenant_licenses_select_owner"
  ON public.tenant_licenses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = tenant_licenses.tenant_id
        AND lower(coalesce(p.role::text, '')) IN ('owner', 'admin', 'manager', 'super_admin', 'sahip', 'yonetici', 'mudur')
    )
  );

-- INSERT/UPDATE/DELETE: yalnızca service_role veya super_admin yapabilir.
DROP POLICY IF EXISTS "tenant_licenses_super_admin_write" ON public.tenant_licenses;
CREATE POLICY "tenant_licenses_super_admin_write"
  ON public.tenant_licenses FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND lower(coalesce(p.role::text, '')) = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND lower(coalesce(p.role::text, '')) = 'super_admin'
    )
  );

COMMENT ON COLUMN public.tenant_licenses.license_key IS
  'Lisans anahtarı — yalnızca tenant owner/manager görebilir; anon erişimi kapalı.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3) support_tickets — tenant üyeleri kendi ticket'larını görsün
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'support_tickets'
  ) THEN
    EXECUTE 'ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON public.support_tickets FROM anon';
  END IF;
END $$;

DROP POLICY IF EXISTS "support_tickets_tenant_member_select" ON public.support_tickets;
CREATE POLICY "support_tickets_tenant_member_select"
  ON public.support_tickets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.tenant_id = support_tickets.tenant_id
    )
  );

DROP POLICY IF EXISTS "support_tickets_tenant_member_insert" ON public.support_tickets;
CREATE POLICY "support_tickets_tenant_member_insert"
  ON public.support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.tenant_id = support_tickets.tenant_id
    )
  );

DROP POLICY IF EXISTS "support_tickets_tenant_owner_update" ON public.support_tickets;
CREATE POLICY "support_tickets_tenant_owner_update"
  ON public.support_tickets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = support_tickets.tenant_id
        AND lower(coalesce(p.role::text, '')) IN ('owner', 'admin', 'manager', 'super_admin', 'sahip', 'yonetici', 'mudur')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = support_tickets.tenant_id
        AND lower(coalesce(p.role::text, '')) IN ('owner', 'admin', 'manager', 'super_admin', 'sahip', 'yonetici', 'mudur')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 4) active_order_items VIEW — SECURITY DEFINER yerine SECURITY INVOKER
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'active_order_items'
  ) THEN
    -- Postgres 15+ özelliği: view sorguyu çağıran kullanıcının yetkisi ile
    -- çalışır → alt tablolardaki RLS politikaları geçerli olur.
    EXECUTE 'ALTER VIEW public.active_order_items SET (security_invoker = true)';
  END IF;
END $$;

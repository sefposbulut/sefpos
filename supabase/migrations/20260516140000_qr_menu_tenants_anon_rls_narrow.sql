/*
  # QR menü: tenants anon SELECT daraltma

  Önceki "Public menu read tenants" politikası `USING (TRUE)` idi — anon ile
  tüm kiracı satırlarının listelenmesi teorik olarak mümkündü.

  Yeni politika: yalnızca en az bir **aktif** ve **menu_enabled** şubesi olan
  kiracılar anon tarafından okunabilir. `loadPublicMenu(branchId)` akışı
  (önce şube, sonra tenant) aynen çalışır; menüsü tamamen kapalı kiracılar
  anon ile tenant satırı okuyamaz (POS authenticated politikaları değişmez).

  Localhost: aynı PostgREST/RLS; VITE_SUPABASE_URL ile bağlanan dev ortamı
  migration uygulandıktan sonra davranış üretimle aynıdır.
*/

BEGIN;

DROP POLICY IF EXISTS "Public menu read tenants" ON public.tenants;

CREATE POLICY "Public menu read tenants"
  ON public.tenants
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.tenant_id = tenants.id
        AND b.is_active = TRUE
        AND COALESCE(b.menu_enabled, TRUE) = TRUE
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';

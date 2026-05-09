/*
  # Lisans paneli (super admin) tenants UPDATE/DELETE/SELECT RLS fix

  ## Sorun
  Onceki politikalar `profiles.role_id` -> `roles.name = 'super_admin'`
  kontrolu yapiyor. Ancak mevcut super admin hesaplarinin (info@aykasoft.com.tr,
  info@sefpos.com.tr) `is_super_admin = true` flag'i var ama `role='admin'` ve
  `role_id` bos. Bu yuzden lisans panelinden plan/tarih degisikligi
  RLS reddi ile sessizce dusuyor.

  ## Cozum
  Politikalari `is_super_admin = true` veya `role IN ('super_admin','admin')`
  koşuluna bagla. Hicbir mevcut super admin disarida kalmasin.
*/

-- UPDATE
DROP POLICY IF EXISTS "Super admin can update tenants" ON public.tenants;
CREATE POLICY "Super admin can update tenants"
  ON public.tenants
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          COALESCE(p.is_super_admin, false) = true
          OR p.role IN ('super_admin', 'admin')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          COALESCE(p.is_super_admin, false) = true
          OR p.role IN ('super_admin', 'admin')
        )
    )
  );

-- DELETE
DROP POLICY IF EXISTS "Super admin can delete tenants" ON public.tenants;
CREATE POLICY "Super admin can delete tenants"
  ON public.tenants
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          COALESCE(p.is_super_admin, false) = true
          OR p.role IN ('super_admin', 'admin')
        )
    )
  );

-- SELECT (tum tenantlari listeleyebilsin diye — sub-policy'lerden biri)
DROP POLICY IF EXISTS "Super admin can view all tenants" ON public.tenants;
CREATE POLICY "Super admin can view all tenants"
  ON public.tenants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          COALESCE(p.is_super_admin, false) = true
          OR p.role IN ('super_admin', 'admin')
        )
    )
  );

NOTIFY pgrst, 'reload schema';

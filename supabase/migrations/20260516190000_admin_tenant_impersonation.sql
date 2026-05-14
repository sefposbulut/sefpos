/*
  # Süper-admin müşteri kiracısında gezinme (impersonation)

  İstemci tarafında profile.tenant_id değiştirmek RLS'yi aşmaz; get_my_tenant_id()
  her zaman profiles.tenant_id döndürüyordu. Süper-admin "Oturum Aç" ile hedef
  restoran verisini görebilmek için hedef tenant sunucuda saklanır ve yardımcı
  fonksiyonlar COALESCE ile bunu kullanır.

  - admin_tenant_impersonation: kullanıcı başına en fazla bir satır (PK user_id)
  - get_my_tenant_id / get_my_tenant_id_direct: impersonation varsa hedef tenant
  - is_owner_or_admin: impersonation sırasında süper-admin için şube kısıtında
    owner/admin ile aynı geniş erişim (şube filtreleri)
*/

CREATE TABLE IF NOT EXISTS public.admin_tenant_impersonation (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  target_tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_tenant_impersonation_target
  ON public.admin_tenant_impersonation (target_tenant_id);

ALTER TABLE public.admin_tenant_impersonation ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.admin_tenant_impersonation IS
  'Süper-adminin POS icinde hangi tenant verisini gorecegi (RLS ile get_my_tenant_id uzerinden).';

DROP POLICY IF EXISTS admin_tenant_impersonation_select_own ON public.admin_tenant_impersonation;
DROP POLICY IF EXISTS admin_tenant_impersonation_insert_super ON public.admin_tenant_impersonation;
DROP POLICY IF EXISTS admin_tenant_impersonation_update_super ON public.admin_tenant_impersonation;
DROP POLICY IF EXISTS admin_tenant_impersonation_delete_super ON public.admin_tenant_impersonation;

-- RLS: yalnizca kendi satiri; yazma sadece super_admin
CREATE POLICY admin_tenant_impersonation_select_own
  ON public.admin_tenant_impersonation
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY admin_tenant_impersonation_insert_super
  ON public.admin_tenant_impersonation
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.get_my_is_super_admin() = true
  );

CREATE POLICY admin_tenant_impersonation_update_super
  ON public.admin_tenant_impersonation
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.get_my_is_super_admin() = true)
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.get_my_is_super_admin() = true);

CREATE POLICY admin_tenant_impersonation_delete_super
  ON public.admin_tenant_impersonation
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.get_my_is_super_admin() = true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_tenant_impersonation TO authenticated;

-- Tenant cozumlemesi: impersonation once
CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT i.target_tenant_id
     FROM public.admin_tenant_impersonation i
     WHERE i.user_id = auth.uid()),
    (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_tenant_id_direct()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT i.target_tenant_id
     FROM public.admin_tenant_impersonation i
     WHERE i.user_id = auth.uid()),
    (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid())
  );
$$;

-- Impersonation sirasinda sube filtrelerinde owner/admin genisligi
CREATE OR REPLACE FUNCTION public.is_owner_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('owner', 'admin')
  )
  OR (
    public.get_my_is_super_admin() = true
    AND EXISTS (
      SELECT 1 FROM public.admin_tenant_impersonation i
      WHERE i.user_id = auth.uid()
    )
  );
$$;

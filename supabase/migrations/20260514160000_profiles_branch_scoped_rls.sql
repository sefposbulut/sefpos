-- Sube bazli profil izolasyonu
--
-- Onceki RLS'de "Enable read for authenticated users" qual=true ile butun
-- authenticated kullanicilar ayni tenant icindeki tum profilleri gorebiliyordu.
-- Yeni kural:
--  - super_admin: tum profilleri gorur
--  - owner/admin: kendi tenant'indaki tum profilleri gorur
--  - manager (Sube Muduru): SADECE kendi branch_id ile esit profilleri gorur
--    (kendi sube ekibini yonetir)
--  - waiter/cashier/courier: sadece kendi profili
--  - service_role/postgres trigger: full erisim (mevcut)

BEGIN;

-- Eski genis read policy'sini at
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Owner admin read tenant profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super admin read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Owner admin manager read tenant profiles" ON public.profiles;

-- Yardimci: caller'in tenant_id ve role ve branch_id degerleri
-- (mevcut helper fonksiyonlari `get_my_tenant_id_direct`, `get_my_role_direct`,
--  `get_my_is_super_admin` zaten var. Branch icin yeni helper ekleyelim.)
CREATE OR REPLACE FUNCTION public.get_my_branch_id_direct()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT branch_id FROM public.profiles WHERE id = auth.uid()
$$;
GRANT EXECUTE ON FUNCTION public.get_my_branch_id_direct() TO authenticated, service_role;

-- 1) Kendi profilini her zaman okuyabil (oturum acan kullanici icin sart)
CREATE POLICY "Profiles read own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

-- 2) Super admin tum profilleri okur
CREATE POLICY "Profiles read super admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.get_my_is_super_admin() = true);

-- 3) Owner/admin: kendi tenant'indaki tum profilleri (sube fark etmez)
CREATE POLICY "Profiles read owner admin tenant wide" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id_direct()
    AND public.get_my_role_direct() IN ('owner', 'admin')
  );

-- 4) Manager (Sube Muduru): sadece kendi branch_id'si ile eslesen profilleri
--    + branch_id IS NULL olan tenant-genel kayitlari (genelde owner/admin)
--    NOT goremesin -> sadece kendi sube ekibi
CREATE POLICY "Profiles read manager branch scoped" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id_direct()
    AND public.get_my_role_direct() = 'manager'
    AND branch_id IS NOT NULL
    AND branch_id = public.get_my_branch_id_direct()
  );

-- UPDATE policy'leri:
-- Owner/admin/manager kendi yetki kapsamindaki profilleri guncelleyebilir.
DROP POLICY IF EXISTS "Owner admin manager can update tenant profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Enable update for own profile" ON public.profiles;

CREATE POLICY "Profiles update own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY "Profiles update super admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.get_my_is_super_admin() = true)
  WITH CHECK (public.get_my_is_super_admin() = true);

CREATE POLICY "Profiles update owner admin tenant" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id_direct()
    AND public.get_my_role_direct() IN ('owner', 'admin')
  )
  WITH CHECK (
    tenant_id = public.get_my_tenant_id_direct()
    AND public.get_my_role_direct() IN ('owner', 'admin')
  );

CREATE POLICY "Profiles update manager branch scoped" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id_direct()
    AND public.get_my_role_direct() = 'manager'
    AND branch_id IS NOT NULL
    AND branch_id = public.get_my_branch_id_direct()
  )
  WITH CHECK (
    tenant_id = public.get_my_tenant_id_direct()
    AND public.get_my_role_direct() = 'manager'
    AND branch_id IS NOT NULL
    AND branch_id = public.get_my_branch_id_direct()
  );

-- DELETE policy: mevcut profiles_delete_tenant_users_or_self koruyalim ama
-- manager icin de branch_id kontrolu eklemeliyiz. Polikayi yeniden yazalim.
DROP POLICY IF EXISTS profiles_delete_tenant_users_or_self ON public.profiles;
DROP POLICY IF EXISTS "Users can delete themselves or managers can delete their tenant users" ON public.profiles;

CREATE POLICY "Profiles delete self or admin or branch manager" ON public.profiles
  FOR DELETE TO authenticated
  USING (
    -- Kendi hesabini silebilir
    id = (SELECT auth.uid())
    OR
    -- Super admin tum profilleri silebilir
    public.get_my_is_super_admin() = true
    OR
    -- Owner/admin: kendi tenant'indaki herkesi silebilir
    (
      tenant_id = public.get_my_tenant_id_direct()
      AND public.get_my_role_direct() IN ('owner', 'admin')
    )
    OR
    -- Manager: sadece KENDI branch'indeki kullanicilari silebilir
    (
      tenant_id = public.get_my_tenant_id_direct()
      AND public.get_my_role_direct() = 'manager'
      AND branch_id IS NOT NULL
      AND branch_id = public.get_my_branch_id_direct()
    )
  );

-- delete_tenant_user RPC'sinin sube kontrolu yapmasi icin de guncelleme
CREATE OR REPLACE FUNCTION public.delete_tenant_user(p_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_caller_role text;
  v_caller_branch uuid;
  v_caller_super boolean;
  v_target_tenant uuid;
  v_target_branch uuid;
  v_target_role text;
  v_deleted integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT tenant_id, role, branch_id, COALESCE(is_super_admin, false)
    INTO v_tenant, v_caller_role, v_caller_branch, v_caller_super
  FROM public.profiles WHERE id = v_caller;

  IF v_tenant IS NULL AND NOT v_caller_super THEN
    RAISE EXCEPTION 'caller profile not found' USING ERRCODE = '42501';
  END IF;

  IF p_target_user_id = v_caller THEN
    RAISE EXCEPTION 'cannot delete self' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id, role, branch_id INTO v_target_tenant, v_target_role, v_target_branch
  FROM public.profiles WHERE id = p_target_user_id;

  IF v_target_tenant IS NULL THEN
    RETURN true; -- zaten yok
  END IF;

  -- Cross-tenant koruma (super_admin haric)
  IF NOT v_caller_super AND v_target_tenant <> v_tenant THEN
    RAISE EXCEPTION 'cross-tenant delete denied' USING ERRCODE = '42501';
  END IF;

  -- Yetki kontrolu
  IF v_caller_super THEN
    -- super admin her seyi silebilir
    NULL;
  ELSIF v_caller_role IN ('owner', 'admin') THEN
    -- owner/admin tenant icinde herkesi silebilir
    NULL;
  ELSIF v_caller_role = 'manager' THEN
    -- manager sadece KENDI branch'indekileri silebilir
    IF v_caller_branch IS NULL OR v_target_branch IS DISTINCT FROM v_caller_branch THEN
      RAISE EXCEPTION 'manager can only delete users in own branch' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(v_target_role, '') IN ('waiter', 'courier') THEN
    UPDATE public.device_bindings
       SET status = 'inactive'
     WHERE tenant_id = v_target_tenant AND waiter_id = p_target_user_id;
    UPDATE public.device_binding_requests
       SET status = 'rejected'
     WHERE tenant_id = v_target_tenant
       AND waiter_id = p_target_user_id
       AND status IN ('pending', 'accepted');
  END IF;

  DELETE FROM public.profiles WHERE id = p_target_user_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'delete had no effect' USING ERRCODE = '42501';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_tenant_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_tenant_user(uuid) TO authenticated;

ANALYZE public.profiles;

COMMIT;

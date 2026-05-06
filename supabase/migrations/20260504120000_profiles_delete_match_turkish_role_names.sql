/*
  # profiles DELETE: match Turkish roles.name + can_manage_users

  Default tenant roles use Turkish names (Yönetici, Şube Müdürü, …), not
  English owner/manager/admin. The previous policy only matched English names
  on roles.name, so role_id-based permission never fired when profiles.role
  was empty or inconsistent — deletes were blocked.

  Re-applies the same policy/function names as 20260503210000 with corrected
  role_id logic (Turkish names OR permissions.can_manage_users).
*/

DROP POLICY IF EXISTS "Enable delete for own profile" ON public.profiles;
DROP POLICY IF EXISTS "Enable delete for self" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete tenant profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete themselves or managers can delete their tenant users"
  ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_tenant_users_or_self" ON public.profiles;

CREATE POLICY "profiles_delete_tenant_users_or_self"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.tenant_id = profiles.tenant_id
        AND (
          COALESCE(p.is_super_admin, false) = true
          OR COALESCE(p.role, '') IN ('owner', 'manager', 'admin', 'super_admin')
          OR EXISTS (
            SELECT 1
            FROM public.roles r
            WHERE r.id = p.role_id
              AND r.tenant_id = p.tenant_id
              AND (
                r.name IN (
                  'owner', 'manager', 'admin', 'super_admin',
                  'Yönetici', 'Şube Müdürü'
                )
                OR COALESCE((r.permissions ->> 'can_manage_users')::boolean, false) = true
              )
          )
        )
    )
  );

CREATE OR REPLACE FUNCTION public.delete_tenant_user(p_target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_target_tenant uuid;
  v_allowed boolean;
  v_deleted integer;
  v_target_role text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE id = v_caller;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'caller profile not found' USING ERRCODE = '42501';
  END IF;

  IF p_target_user_id = v_caller THEN
    RAISE EXCEPTION 'cannot delete self' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id, role INTO v_target_tenant, v_target_role
  FROM public.profiles
  WHERE id = p_target_user_id;

  IF v_target_tenant IS NULL THEN
    RETURN true;
  END IF;

  IF v_target_tenant <> v_tenant THEN
    RAISE EXCEPTION 'cross-tenant delete denied' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_caller
      AND p.tenant_id = v_tenant
      AND (
        COALESCE(p.is_super_admin, false) = true
        OR COALESCE(p.role, '') IN ('owner', 'manager', 'admin', 'super_admin')
        OR EXISTS (
          SELECT 1
          FROM public.roles r
          WHERE r.id = p.role_id
            AND r.tenant_id = p.tenant_id
            AND (
              r.name IN (
                'owner', 'manager', 'admin', 'super_admin',
                'Yönetici', 'Şube Müdürü'
              )
              OR COALESCE((r.permissions ->> 'can_manage_users')::boolean, false) = true
            )
        )
      )
  ) INTO v_allowed;

  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(v_target_role, '') IN ('waiter', 'courier') THEN
    UPDATE public.device_bindings
    SET status = 'inactive'
    WHERE tenant_id = v_tenant AND waiter_id = p_target_user_id;

    UPDATE public.device_binding_requests
    SET status = 'rejected'
    WHERE tenant_id = v_tenant
      AND waiter_id = p_target_user_id
      AND status IN ('pending', 'accepted');
  END IF;

  DELETE FROM public.profiles
  WHERE id = p_target_user_id AND tenant_id = v_tenant;

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

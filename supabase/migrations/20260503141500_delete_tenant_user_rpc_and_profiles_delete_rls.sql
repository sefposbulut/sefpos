/*
  # Tenant user delete: RPC + RLS aligned with profiles.role

  Some tenants have profiles.role set (owner/manager/…) while role_id is null
  or not wired to roles.id; DELETE RLS only checked role_id and blocked deletes.

  1. Broaden profiles DELETE policy using role text, is_super_admin, or role_id.
  2. Add public.delete_tenant_user(uuid) SECURITY DEFINER for reliable deletes
     when RLS or PostgREST edge cases still block direct DELETE.
*/

DROP POLICY IF EXISTS "Users can delete themselves or managers can delete their tenant users"
  ON public.profiles;

CREATE POLICY "Users can delete themselves or managers can delete their tenant users"
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
          OR p.role_id IN (
            SELECT r.id
            FROM public.roles r
            WHERE r.tenant_id = p.tenant_id
              AND r.name IN ('owner', 'manager', 'admin', 'super_admin')
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
        OR p.role_id IN (
          SELECT r.id
          FROM public.roles r
          WHERE r.tenant_id = p.tenant_id
            AND r.name IN ('owner', 'manager', 'admin', 'super_admin')
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

COMMENT ON FUNCTION public.delete_tenant_user(uuid) IS
  'Deletes a tenant profile row when caller is owner/manager/admin (role text, role_id, or super_admin). Does not remove auth.users; use update-user edge delete_user for full auth removal.';

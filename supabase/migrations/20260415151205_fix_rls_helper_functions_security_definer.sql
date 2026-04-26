/*
  # Fix RLS Helper Functions - SECURITY DEFINER

  ## Problem
  The helper functions (get_my_tenant_id, get_my_branch_id, is_owner_or_admin, has_permission)
  query the `profiles` table. The `profiles` table has RLS enabled with a policy that calls
  these same helper functions, creating an infinite recursion / deadlock.

  ## Solution
  Recreate all helper functions with SECURITY DEFINER so they bypass RLS when querying
  profiles internally. Also set search_path to prevent privilege escalation.
*/

CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_my_branch_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT branch_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_owner_or_admin()
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
  );
$$;

CREATE OR REPLACE FUNCTION has_permission(permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = auth.uid()
    AND (r.permissions ->> permission_key)::boolean = true
  );
$$;

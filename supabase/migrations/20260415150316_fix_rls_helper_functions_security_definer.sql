/*
  # Fix RLS Infinite Recursion in Helper Functions

  ## Problem
  The RLS policy "Branch isolated profiles view" on the `profiles` table calls
  get_my_tenant_id(), get_my_branch_id(), and is_owner_or_admin() which all
  query the `profiles` table again — causing infinite recursion and hanging
  the client indefinitely.

  ## Fix
  Mark all helper functions as SECURITY DEFINER so they bypass RLS when
  executing, breaking the recursion loop.

  ## Functions Updated
  - get_my_tenant_id() - now uses SECURITY DEFINER
  - get_my_branch_id() - now uses SECURITY DEFINER
  - is_owner_or_admin() - now uses SECURITY DEFINER
  - has_permission() - now uses SECURITY DEFINER
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

/*
  # Fix profiles policies - completely simple, zero recursion

  ## Problem
  JWT does not contain role or is_super_admin fields.
  Previous fix still called get_my_tenant_id() which queries profiles -> recursion.

  ## Solution
  - Own profile: auth.uid() = id  (zero recursion)
  - Tenant members: direct subquery on profiles using auth.uid() with NO_RLS hint via security definer function
  - Remove all policies that query profiles from within a profiles policy
*/

-- Drop all current SELECT policies on profiles
DROP POLICY IF EXISTS "Branch isolated profiles view" ON profiles;
DROP POLICY IF EXISTS "Super admin can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Owner and admin can read tenant profiles" ON profiles;
DROP POLICY IF EXISTS "Super admin can read all profiles" ON profiles;

-- Create a security definer function to get tenant_id directly bypassing RLS
CREATE OR REPLACE FUNCTION get_my_tenant_id_direct()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_my_role_direct()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_my_is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(is_super_admin, false) FROM public.profiles WHERE id = auth.uid();
$$;

-- Policy 1: Every authenticated user can read their own profile (no function calls)
CREATE POLICY "Read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Policy 2: Owners and admins can read all profiles in their tenant
CREATE POLICY "Owner admin read tenant profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    tenant_id = get_my_tenant_id_direct()
    AND get_my_role_direct() IN ('owner', 'admin', 'manager')
  );

-- Policy 3: Super admins can read all profiles
CREATE POLICY "Super admin read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (get_my_is_super_admin() = true);

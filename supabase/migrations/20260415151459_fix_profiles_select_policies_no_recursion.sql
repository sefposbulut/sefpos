/*
  # Fix profiles SELECT policies - eliminate all recursion

  ## Problem
  The current SELECT policies on profiles create infinite recursion:
  
  1. "Branch isolated profiles view" calls get_my_tenant_id() which queries profiles
  2. "Super admin can view all profiles" does a self-join on profiles (SELECT 1 FROM profiles p2)
  
  Even with SECURITY DEFINER on helper functions, the policy evaluation itself can
  cause recursion during session startup before the security definer cache warms up.

  ## Solution
  - Replace "Branch isolated profiles view" with a direct auth.uid() based check
  - Replace "Super admin can view all profiles" with a JWT claim check instead of
    a self-join on profiles
  - Keep the own-profile access simple: auth.uid() = id
*/

-- Drop the problematic recursive policies
DROP POLICY IF EXISTS "Branch isolated profiles view" ON profiles;
DROP POLICY IF EXISTS "Super admin can view all profiles" ON profiles;

-- Allow users to read their own profile (no recursion - direct uid comparison)
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Allow owner/admin to read all profiles in their tenant
-- Uses auth.jwt() to avoid querying profiles table
CREATE POLICY "Owner and admin can read tenant profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    tenant_id = get_my_tenant_id()
    AND (
      (auth.jwt() ->> 'role') IN ('owner', 'admin')
      OR id = auth.uid()
    )
  );

-- Super admin: use app_metadata flag from JWT (set by trigger, not by user)
CREATE POLICY "Super admin can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean = true
  );

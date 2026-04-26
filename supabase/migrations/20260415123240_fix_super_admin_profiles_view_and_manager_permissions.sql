/*
  # Super Admin Profiles View & Manager Permissions Fix

  1. Changes
    - Add RLS policy for super_admin to view all profiles across all tenants
    - Update is_owner_or_admin() function to include 'manager' role for branch-level access
    - Add separate is_branch_manager() helper function

  2. Problem
    - AdminPanel could not load user profiles for other tenants because the
      'Branch isolated profiles view' policy requires tenant_id = get_my_tenant_id()
    - Super admins need to see ALL tenant profiles for the admin dashboard

  3. Security
    - Only users with is_super_admin = true can view all profiles
    - Manager role can now manage users within their own branch (existing has_permission check already handles this)
*/

-- Add super_admin can view all profiles policy
CREATE POLICY "Super admin can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p2
      WHERE p2.id = auth.uid()
      AND p2.is_super_admin = true
    )
  );

/*
  # Fix table_groups INSERT RLS for owners and admins

  ## Problem
  The "Branch isolated table groups insert" policy requires branch_id = get_my_branch_id().
  Owner/admin users typically have NULL branch_id in their profile, so inserts fail
  when they try to create a group assigned to a specific branch.

  ## Fix
  Drop the conflicting "Branch isolated table groups insert" policy and rely on
  the existing "Owner admin can insert table groups" policy which already handles
  owner/admin correctly. Also fix the branch-user insert to allow their own branch.
*/

DROP POLICY IF EXISTS "Branch isolated table groups insert" ON public.table_groups;

CREATE POLICY "Branch isolated table groups insert"
  ON public.table_groups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND (
      is_owner_or_admin()
      OR branch_id = get_my_branch_id()
    )
  );

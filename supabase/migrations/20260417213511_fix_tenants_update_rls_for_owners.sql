/*
  # Fix tenants UPDATE RLS policy to allow owners to update their own tenant

  ## Problem
  The tenants UPDATE policy only allowed super admins to update tenant rows.
  This prevented owners from saving their PIN lock code and other tenant settings.

  ## Changes
  - Add a new UPDATE policy that allows tenant owners to update their own tenant row
  - The policy checks that the user's profile role is 'owner' and matches the tenant_id
  - Super admin policy remains unchanged
*/

CREATE POLICY "Owners can update their own tenant"
  ON tenants FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.tenant_id = tenants.id
        AND profiles.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.tenant_id = tenants.id
        AND profiles.role = 'owner'
    )
  );

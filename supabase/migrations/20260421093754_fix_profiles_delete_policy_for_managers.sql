/*
  # Fix Profiles Delete Policy for Managers

  Allow managers and admins to delete other users in their tenant.
  Previously only allowed self-deletion.
*/

DROP POLICY IF EXISTS "Enable delete for self" ON public.profiles;

CREATE POLICY "Users can delete themselves or managers can delete their tenant users"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (
    -- User can delete themselves
    id = auth.uid()
    OR
    -- Or manager/admin can delete users in their tenant
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.tenant_id = profiles.tenant_id
      AND p.role_id IN (
        SELECT id FROM public.roles
        WHERE name IN ('manager', 'admin', 'super_admin')
      )
    )
  );

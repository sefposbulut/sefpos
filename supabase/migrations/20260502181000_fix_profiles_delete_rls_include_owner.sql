/*
  # Fix profiles DELETE RLS for restaurant owners

  Policy "Users can delete themselves or managers can delete their tenant users"
  only allowed role names manager, admin, super_admin — not owner. Owners saw
  "deleted" in the UI while PostgREST deleted 0 rows (no error). Include owner
  in the same-tenant delete permission.
*/

DROP POLICY IF EXISTS "Users can delete themselves or managers can delete their tenant users"
  ON public.profiles;

CREATE POLICY "Users can delete themselves or managers can delete their tenant users"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.tenant_id = profiles.tenant_id
        AND p.role_id IN (
          SELECT id
          FROM public.roles
          WHERE name IN ('owner', 'manager', 'admin', 'super_admin')
        )
    )
  );

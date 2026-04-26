/*
  # Fix Tenants Delete Policy - Use Role ID

  Fix the policy to correctly check for super_admin role using role_id and roles table.
*/

DROP POLICY IF EXISTS "Super admin can delete tenants" ON public.tenants;

CREATE POLICY "Super admin can delete tenants"
  ON public.tenants
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Super admin can view all tenants" ON public.tenants;

CREATE POLICY "Super admin can view all tenants"
  ON public.tenants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "Super admin can update tenants" ON public.tenants;

CREATE POLICY "Super admin can update tenants"
  ON public.tenants
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON p.role_id = r.id
      WHERE p.id = auth.uid()
      AND r.name = 'super_admin'
    )
  );

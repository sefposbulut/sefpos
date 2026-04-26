/*
  # Add Tenants Delete Policy

  Allow super_admin to delete tenants with all related data.
*/

DROP POLICY IF EXISTS "Super admin can delete tenants" ON public.tenants;

CREATE POLICY "Super admin can delete tenants"
  ON public.tenants
  FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
  );

DROP POLICY IF EXISTS "Super admin can view all tenants" ON public.tenants;

CREATE POLICY "Super admin can view all tenants"
  ON public.tenants
  FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
  );

DROP POLICY IF EXISTS "Super admin can update tenants" ON public.tenants;

CREATE POLICY "Super admin can update tenants"
  ON public.tenants
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin'
  );

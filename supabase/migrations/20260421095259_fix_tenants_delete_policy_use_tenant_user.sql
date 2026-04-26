/*
  # Fix Tenants Delete Policy - User Tenant Access

  Tenants table policies need to check if user belongs to that tenant.
  User can delete, view, and update their own tenant.
*/

DROP POLICY IF EXISTS "Tenant owner can delete tenants" ON public.tenants;
DROP POLICY IF EXISTS "Tenant owner can view tenants" ON public.tenants;
DROP POLICY IF EXISTS "Tenant owner can update tenants" ON public.tenants;

CREATE POLICY "Users can delete their tenant"
  ON public.tenants
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.tenant_id = tenants.id
      AND profiles.id = auth.uid()
    )
  );

CREATE POLICY "Users can view their tenant"
  ON public.tenants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.tenant_id = tenants.id
      AND profiles.id = auth.uid()
    )
  );

CREATE POLICY "Users can update their tenant"
  ON public.tenants
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.tenant_id = tenants.id
      AND profiles.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.tenant_id = tenants.id
      AND profiles.id = auth.uid()
    )
  );

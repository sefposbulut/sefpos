/*
  print_settings UPSERT 403 (F12):
  Politikalar profiles.tenant_id ile doğrudan eşleşiyordu; süper admin impersonation
  veya kiracı bağlamı farklıyken get_my_tenant_id() kullanılmayan tablolar gibi reddediyordu.
  SELECT/INSERT/UPDATE/DELETE → public.get_my_tenant_id() ile hizalanır.
*/

DROP POLICY IF EXISTS "Tenant members can view print settings" ON public.print_settings;
DROP POLICY IF EXISTS "Tenant members can insert print settings" ON public.print_settings;
DROP POLICY IF EXISTS "Tenant members can update print settings" ON public.print_settings;
DROP POLICY IF EXISTS "Tenant members can delete print settings" ON public.print_settings;
DROP POLICY IF EXISTS "print_settings_select_tenant_members" ON public.print_settings;
DROP POLICY IF EXISTS "print_settings_insert_tenant_members" ON public.print_settings;
DROP POLICY IF EXISTS "print_settings_update_tenant_members" ON public.print_settings;
DROP POLICY IF EXISTS "print_settings_delete_tenant_members" ON public.print_settings;

CREATE POLICY "print_settings_select_tenant"
  ON public.print_settings FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

CREATE POLICY "print_settings_insert_tenant"
  ON public.print_settings FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id());

CREATE POLICY "print_settings_update_tenant"
  ON public.print_settings FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

CREATE POLICY "print_settings_delete_tenant"
  ON public.print_settings FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

NOTIFY pgrst, 'reload schema';

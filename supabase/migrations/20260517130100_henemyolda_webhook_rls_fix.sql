/*
  # HemenYolda RLS policy fix (42P01 — missing FROM-clause)

  Eğer 20260517130000 migration policy adımında kırıldıysa bu dosyayı çalıştırın.
*/

DROP POLICY IF EXISTS "Tenant admins manage hemenyolda integrations" ON public.henemyolda_integrations;
CREATE POLICY "Tenant admins manage hemenyolda integrations"
  ON public.henemyolda_integrations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = tenant_id
        AND p.role IN ('admin', 'owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = tenant_id
        AND p.role IN ('admin', 'owner', 'manager')
    )
  );

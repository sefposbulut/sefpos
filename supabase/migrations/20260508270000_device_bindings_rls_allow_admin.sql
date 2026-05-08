/*
  device_bindings ve device_binding_requests üzerindeki yönetici politikası
  yalnızca owner/manager içeriyordu; profil text'i 'admin' (Yönetici) olan
  kullanıcılar DELETE/UPDATE'de RLS reddiyle sessizce 0 satır etkiliyor ve
  Cihaz Yönetimi'nde "siliyor ama silmiyor" hissi oluşuyordu.
  Politikayı admin ve is_super_admin'i kapsayacak şekilde genişletir.
*/

DROP POLICY IF EXISTS "Managers can manage tenant device bindings" ON public.device_bindings;
CREATE POLICY "Managers can manage tenant device bindings"
  ON public.device_bindings
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('owner','admin','manager')
      OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
    )
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('owner','admin','manager')
      OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
    )
  );

DROP POLICY IF EXISTS "Managers can view tenant device bindings" ON public.device_bindings;
CREATE POLICY "Managers can view tenant device bindings"
  ON public.device_bindings
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('owner','admin','manager')
      OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
    )
  );

DROP POLICY IF EXISTS "Managers manage tenant binding requests" ON public.device_binding_requests;
CREATE POLICY "Managers manage tenant binding requests"
  ON public.device_binding_requests
  FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('owner','admin','manager')
      OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
    )
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid())
        IN ('owner','admin','manager')
      OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()) = true
    )
  );

NOTIFY pgrst, 'reload schema';

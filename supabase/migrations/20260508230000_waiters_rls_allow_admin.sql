/*
  Waiters tablosu RLS politikası "Managers can manage waiters" eskiden sadece
  owner ve manager rollerine izin veriyordu. profiles_role_text_sync trigger'ı
  Türkçe "Yönetici" rolünü "admin" text'ine eşliyor; bu yüzden Yönetici hesabı
  garson ekleyemiyordu (RLS reddi). Politikayı admin ve is_super_admin'i de
  kapsayacak şekilde genişletiyoruz.
*/

DROP POLICY IF EXISTS "Managers can manage waiters" ON public.waiters;

CREATE POLICY "Managers can manage waiters"
  ON public.waiters
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

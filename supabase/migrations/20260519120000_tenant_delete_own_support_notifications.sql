/*
  Restoran (kiracı) kendi bildirimlerini listeden kalıcı silebilsin.
  Genel yayınlar (tenant_id IS NULL) silinmez; istemci tarafında gizlenir.
*/

DROP POLICY IF EXISTS "Tenant can delete own notifications" ON public.support_notifications;

CREATE POLICY "Tenant can delete own notifications"
  ON public.support_notifications
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

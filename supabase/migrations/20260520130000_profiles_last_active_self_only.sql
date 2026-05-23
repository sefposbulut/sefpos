-- last_active_at: yalnızca kendi satırı; başka kullanıcıyı çevrimiçi gösteremez.

DROP POLICY IF EXISTS "Profiles update own last_active" ON public.profiles;

CREATE POLICY "Profiles update own last_active"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

COMMENT ON POLICY "Profiles update own last_active" ON public.profiles IS
  'Canlılık pingi: kullanıcı yalnızca kendi last_active_at alanını günceller (RLS).';

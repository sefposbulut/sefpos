-- Restoran kullanıcı canlılığı (admin panel) — hafif ping.
-- Yalnızca Supabase Postgres (birincil bulut DB). SQL Server'da bu dosyayı çalıştırmayın.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    RAISE NOTICE
      'public.profiles yok — migration atlandi. '
      'Dogru Supabase projesinde once tum supabase/migrations uygulanmali.';
    RETURN;
  END IF;

  ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

  COMMENT ON COLUMN public.profiles.last_active_at IS
    'Son uygulama nabız zamanı (POS açık, sekme görünür). Admin çevrimiçi göstergesi.';

  CREATE INDEX IF NOT EXISTS idx_profiles_last_active_at
    ON public.profiles (last_active_at DESC)
    WHERE last_active_at IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_profiles_tenant_last_active
    ON public.profiles (tenant_id, last_active_at DESC)
    WHERE last_active_at IS NOT NULL;
END $$;

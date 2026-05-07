-- Garson cihazı onayı sonrası anında tepki için Realtime (yoksa 2 sn polling yeter).
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'device_bindings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.device_bindings;
  END IF;
END $$;

COMMIT;

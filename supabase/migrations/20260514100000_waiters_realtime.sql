-- Garson pasif edildiğinde / silindiğinde anında oturumu kapatabilmek için Realtime.
-- supabase_realtime publication'a public.waiters tablosunu ekle.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'waiters'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.waiters;
  END IF;
END $$;

COMMIT;

/*
  # support_notifications — Realtime publication'a ekle

  ## Amac
  Lisans paneli (AdminPanel) bir bildirim INSERT ettiginde tum acik
  restoran sayfalari (App.tsx + Header.tsx subscribe ediyor) anlik olarak
  banner gostersin. Tablo `supabase_realtime` publication'inda olmadigi icin
  INSERT event'leri yayilmiyordu — kullanici sayfayi yenilemeden bildirim
  gelmiyordu.

  ## Idempotent
  Tablo zaten publication'daysa hata atilmaz.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'support_notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.support_notifications';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

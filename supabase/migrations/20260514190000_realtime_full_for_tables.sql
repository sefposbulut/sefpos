-- Realtime: masaların durumunun TÜM cihazlarda anında değişmesi için gerekli.
-- 1) Eksik tabloları supabase_realtime publication'a ekle
-- 2) DELETE/UPDATE event'lerinde tüm OLD row'un gelmesi için REPLICA IDENTITY FULL
--    aksi halde DELETE'de yalnız PK gelir ve order_id'den table_id'ye ulaşamayız.

DO $$
BEGIN
  -- payment_transactions: parça ödeme alındığında masa kalan tutarı için lazım
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'payment_transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_transactions;
  END IF;

  -- table_groups: masa grup adı/sırası değişince UI tazelensin
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'table_groups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.table_groups;
  END IF;
END $$;

-- DELETE/UPDATE event'lerinde OLD row eksiksiz gelsin (full replica identity)
ALTER TABLE public.restaurant_tables   REPLICA IDENTITY FULL;
ALTER TABLE public.orders              REPLICA IDENTITY FULL;
ALTER TABLE public.order_items         REPLICA IDENTITY FULL;
ALTER TABLE public.payment_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.table_groups        REPLICA IDENTITY FULL;

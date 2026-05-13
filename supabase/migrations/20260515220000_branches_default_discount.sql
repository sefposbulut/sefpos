-- Şube bazlı sabit iskonto.
--
-- Bazı işletmeler her satışa otomatik %X iskonto uyguluyor (ör. personel
-- yemekhanesi, belirli bir müşteri tipi vs.). Bu kolonlar şube bazında
-- (NULL/0 ise pasif) varsayılan iskonto yüzdesini tutar. Uygulama tarafı
-- yeni siparişte ödeme ekranındaki iskonto alanını bu değerle ön-doldurur;
-- kullanıcı istediği zaman geçici olarak değiştirebilir.

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS default_discount_percent integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_discount_active  boolean NOT NULL DEFAULT false;

-- 0-100 aralığında kalsın (negatif/anormal değerlere izin vermeyelim).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'branches_default_discount_percent_range'
  ) THEN
    ALTER TABLE public.branches
      ADD CONSTRAINT branches_default_discount_percent_range
      CHECK (default_discount_percent >= 0 AND default_discount_percent <= 100);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

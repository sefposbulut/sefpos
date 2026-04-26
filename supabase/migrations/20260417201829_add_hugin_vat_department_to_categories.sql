/*
  # Hugin Yazarkasa: Kategori bazli KDV ve Departman

  ## Degisiklikler
  - categories tablosuna `vat_rate` kolonu eklendi (0, 1, 8, 10, 18, 20 degerlerinden biri)
  - categories tablosuna `hugin_department_id` kolonu eklendi (Hugin departman numarasi)

  ## Notlar
  - vat_rate: NULL ise global KDV ayari kullanilir, deger girilmisse o kullanilir
  - hugin_department_id: NULL ise global departman ayari kullanilir
  - Mevcut kategoriler etkilenmez (NULL = global ayar kulllan)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'vat_rate'
  ) THEN
    ALTER TABLE categories ADD COLUMN vat_rate integer DEFAULT NULL CHECK (vat_rate IN (0, 1, 8, 10, 18, 20));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categories' AND column_name = 'hugin_department_id'
  ) THEN
    ALTER TABLE categories ADD COLUMN hugin_department_id integer DEFAULT NULL;
  END IF;
END $$;

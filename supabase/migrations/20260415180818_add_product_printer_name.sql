/*
  # Add printer_name to products table

  ## Summary
  Ürün bazlı yazıcı yönlendirmesi için products tablosuna printer_name kolonu eklenir.
  Eğer bir ürüne özel yazıcı atanmışsa, sipariş geldiğinde bu yazıcıya gönderilir.
  Atanmamışsa kategori yazıcısı veya varsayılan yazıcı kullanılır.

  ## Changes
  - `products` tablosuna `printer_name` (text, nullable) kolonu eklendi
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'printer_name'
  ) THEN
    ALTER TABLE products ADD COLUMN printer_name text DEFAULT NULL;
  END IF;
END $$;

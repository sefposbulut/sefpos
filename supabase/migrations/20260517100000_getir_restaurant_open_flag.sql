-- Getir uygulamasında restoran açık/kapalı (POS durumundan ayrı)
ALTER TABLE online_order_platforms
  ADD COLUMN IF NOT EXISTS getir_restaurant_open boolean;

COMMENT ON COLUMN online_order_platforms.getir_restaurant_open IS
  'Getir müşteri uygulamasında restoran açık (true) / kapalı (false). NULL = henüz senkron yok.';

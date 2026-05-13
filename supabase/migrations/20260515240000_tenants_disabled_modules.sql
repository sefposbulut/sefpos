-- Tenant bazlı modül görünürlüğü.
--
-- Bazı müşteriler ŞefPOS'u sadece "Hızlı Satış" için kullanır (masalar / paket
-- servis / online siparişler vs. ekranları kafa karıştırıyor). Lisans panelinden
-- süper-admin, bu tenant için belirli modülleri gizleyebilsin.
--
-- `disabled_modules` boş array (default) ise tüm modüller görünür — yani
-- mevcut tüm tenant'lar için davranış değişmez.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS disabled_modules text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE INDEX IF NOT EXISTS idx_tenants_disabled_modules
  ON public.tenants USING gin (disabled_modules);

NOTIFY pgrst, 'reload schema';

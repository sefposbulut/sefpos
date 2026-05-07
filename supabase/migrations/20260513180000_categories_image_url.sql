-- Public menu / QR menü: categories.image_url kolonu (nullable)
-- Client kategori thumbnail'i icin select ediyor; yoksa 400 donuyor.

BEGIN;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Mevcut anon SELECT policy'si kategoriler icin zaten var
-- (public_menu_categories_select). image_url da otomatik dahil olur.

COMMIT;

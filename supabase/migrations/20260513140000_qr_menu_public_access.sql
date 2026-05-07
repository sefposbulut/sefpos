-- ŞefPOS: QR Menü için anonim (public) okuma erişimi
-- - menu_visible flag (categories, products) → admin tarafından gizlenebilir
-- - branch.menu_enabled → restoran/şube QR menüsünü kapatabilir
-- - tenants.menu_theme → ileride tema/renk için JSON
-- - public read RLS: SADECE aktif + menüde görünür kayıtlar (anon role)

BEGIN;

-- Flag'ler
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS menu_visible BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS menu_visible BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS menu_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS menu_theme JSONB;

-- Public RLS — anon role
-- (tenants, branches, categories, products, product_variants)

DROP POLICY IF EXISTS "Public menu read tenants" ON public.tenants;
CREATE POLICY "Public menu read tenants"
  ON public.tenants
  FOR SELECT
  TO anon
  USING (TRUE);

DROP POLICY IF EXISTS "Public menu read branches" ON public.branches;
CREATE POLICY "Public menu read branches"
  ON public.branches
  FOR SELECT
  TO anon
  USING (
    is_active = TRUE
    AND COALESCE(menu_enabled, TRUE) = TRUE
  );

DROP POLICY IF EXISTS "Public menu read categories" ON public.categories;
CREATE POLICY "Public menu read categories"
  ON public.categories
  FOR SELECT
  TO anon
  USING (
    COALESCE(menu_visible, TRUE) = TRUE
  );

DROP POLICY IF EXISTS "Public menu read products" ON public.products;
CREATE POLICY "Public menu read products"
  ON public.products
  FOR SELECT
  TO anon
  USING (
    COALESCE(is_active, TRUE) = TRUE
    AND COALESCE(menu_visible, TRUE) = TRUE
  );

DROP POLICY IF EXISTS "Public menu read product_variants" ON public.product_variants;
CREATE POLICY "Public menu read product_variants"
  ON public.product_variants
  FOR SELECT
  TO anon
  USING (
    COALESCE(is_active, TRUE) = TRUE
  );

-- GRANT'lar (RLS açıkken policy yeterli ama yine de SELECT izni gerekli)
GRANT SELECT ON public.tenants TO anon;
GRANT SELECT ON public.branches TO anon;
GRANT SELECT ON public.categories TO anon;
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.product_variants TO anon;

COMMIT;

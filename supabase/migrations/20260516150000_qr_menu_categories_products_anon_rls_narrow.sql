/*
  # QR menü: categories / products / product_variants anon SELECT daraltma

  Anon politikaları yalnızca menu_visible / is_active ile sınırlıydı; tenant
  filtresi olmadan teorik olarak tüm kiracıların satırları okunabilirdi.

  Yeni koşul: ilgili tenant için en az bir **aktif** ve **menu_enabled** şube
  olmalı (branches ile EXISTS). `loadPublicMenu` sorguları aynı kalır; menüsü
  tamamen kapalı kiracıların ürünleri anon ile okunamaz.
*/

BEGIN;

DROP POLICY IF EXISTS "Public menu read categories" ON public.categories;
CREATE POLICY "Public menu read categories"
  ON public.categories
  FOR SELECT
  TO anon
  USING (
    COALESCE(menu_visible, TRUE) = TRUE
    AND EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.tenant_id = categories.tenant_id
        AND b.is_active = TRUE
        AND COALESCE(b.menu_enabled, TRUE) = TRUE
    )
  );

DROP POLICY IF EXISTS "Public menu read products" ON public.products;
CREATE POLICY "Public menu read products"
  ON public.products
  FOR SELECT
  TO anon
  USING (
    COALESCE(is_active, TRUE) = TRUE
    AND COALESCE(menu_visible, TRUE) = TRUE
    AND EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.tenant_id = products.tenant_id
        AND b.is_active = TRUE
        AND COALESCE(b.menu_enabled, TRUE) = TRUE
    )
  );

DROP POLICY IF EXISTS "Public menu read product_variants" ON public.product_variants;
CREATE POLICY "Public menu read product_variants"
  ON public.product_variants
  FOR SELECT
  TO anon
  USING (
    COALESCE(product_variants.is_active, TRUE) = TRUE
    AND EXISTS (
      SELECT 1
      FROM public.products p
      INNER JOIN public.branches b ON b.tenant_id = p.tenant_id
      WHERE p.id = product_variants.product_id
        AND COALESCE(p.is_active, TRUE) = TRUE
        AND COALESCE(p.menu_visible, TRUE) = TRUE
        AND b.is_active = TRUE
        AND COALESCE(b.menu_enabled, TRUE) = TRUE
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';

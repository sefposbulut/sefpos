/*
  Stok yönetimi: müdür (manager) rolü de ürün ekleyebilsin/güncelleyebilsin.
  20260425122932 yalnızca owner/admin bırakmıştı; kasa müdürü ekleme yapamıyordu.
*/

DROP POLICY IF EXISTS "Admin can insert products" ON public.products;
DROP POLICY IF EXISTS "Admin can update products" ON public.products;
DROP POLICY IF EXISTS "Admin can delete products" ON public.products;

CREATE POLICY "Owners managers admins can insert products"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = products.tenant_id
        AND p.role IN ('owner', 'admin', 'manager')
    )
  );

CREATE POLICY "Owners managers admins can update products"
  ON public.products FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = products.tenant_id
        AND p.role IN ('owner', 'admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = products.tenant_id
        AND p.role IN ('owner', 'admin', 'manager')
    )
  );

CREATE POLICY "Owners managers admins can delete products"
  ON public.products FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = products.tenant_id
        AND p.role IN ('owner', 'admin', 'manager')
    )
  );

DROP POLICY IF EXISTS "Owners and managers can insert variants" ON public.product_variants;
DROP POLICY IF EXISTS "Owners and managers can update variants" ON public.product_variants;
DROP POLICY IF EXISTS "Owners and managers can delete variants" ON public.product_variants;

CREATE POLICY "Owners managers admins can insert variants"
  ON public.product_variants FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = product_variants.tenant_id
        AND p.role IN ('owner', 'admin', 'manager')
    )
  );

CREATE POLICY "Owners managers admins can update variants"
  ON public.product_variants FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = product_variants.tenant_id
        AND p.role IN ('owner', 'admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = product_variants.tenant_id
        AND p.role IN ('owner', 'admin', 'manager')
    )
  );

CREATE POLICY "Owners managers admins can delete variants"
  ON public.product_variants FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.tenant_id = product_variants.tenant_id
        AND p.role IN ('owner', 'admin', 'manager')
    )
  );

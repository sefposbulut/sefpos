/*
  # Impersonation: ürün / kategori / varyant SELECT RLS

  Tenant users can view products / Users can view own tenant categories /
  Users can view variants — politikaları doğrudan profiles.tenant_id ile
  kiracı eşliyordu; süper-admin müşteri kiracısına geçince hedef tenant ile
  uyuşmuyordu. public.get_my_tenant_id() impersonation satırını dikkate alır.
*/

DROP POLICY IF EXISTS "Tenant users can view products" ON public.products;
CREATE POLICY "Tenant users can view products"
  ON public.products FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "Users can view own tenant categories" ON public.categories;
CREATE POLICY "Users can view own tenant categories"
  ON public.categories FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

DROP POLICY IF EXISTS "Users can view variants in their tenant" ON public.product_variants;
CREATE POLICY "Users can view variants in their tenant"
  ON public.product_variants FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

/*
  # Güvenlik: stok tablolarında tenant izolasyonu (P0)

  `stock_movements` ve `branch_product_stocks` ilk oluşturulduğunda RLS açık
  olsa da politikalar `USING (true)` idi — anon/authenticated PostgREST ile
  teoride tüm restoranların stok hareketlerine ve şube stok satırlarına
  erişim riski oluşturuyordu.

  Bu migration:
  - Eski "Anyone can read/write" politikalarını kaldırır
  - `anon` rolünden tablo izinlerini geri alır (POS her zaman girişli kullanıcı)
  - Tenant üyesi veya `profiles.is_super_admin` için izole erişim tanımlar

  QR menü / waiter_calls anon akışı bu tabloları kullanmaz; davranış bozulmaz.
*/

BEGIN;

-- ─── stock_movements ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can read stock movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Anyone can write stock movements" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_select_tenant" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_insert_tenant" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_update_tenant" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_delete_tenant" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_tenant_access" ON public.stock_movements;

REVOKE ALL ON public.stock_movements FROM anon;

CREATE POLICY "stock_movements_tenant_access"
  ON public.stock_movements FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND (
          COALESCE(p.is_super_admin, false) = true
          OR p.tenant_id = stock_movements.tenant_id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND (
          COALESCE(p.is_super_admin, false) = true
          OR p.tenant_id = stock_movements.tenant_id
        )
    )
  );

-- ─── branch_product_stocks ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can read branch stocks" ON public.branch_product_stocks;
DROP POLICY IF EXISTS "Anyone can write branch stocks" ON public.branch_product_stocks;
DROP POLICY IF EXISTS "branch_product_stocks_select_tenant" ON public.branch_product_stocks;
DROP POLICY IF EXISTS "branch_product_stocks_insert_tenant" ON public.branch_product_stocks;
DROP POLICY IF EXISTS "branch_product_stocks_update_tenant" ON public.branch_product_stocks;
DROP POLICY IF EXISTS "branch_product_stocks_delete_tenant" ON public.branch_product_stocks;
DROP POLICY IF EXISTS "branch_product_stocks_tenant_access" ON public.branch_product_stocks;

REVOKE ALL ON public.branch_product_stocks FROM anon;

CREATE POLICY "branch_product_stocks_tenant_access"
  ON public.branch_product_stocks FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND (
          COALESCE(p.is_super_admin, false) = true
          OR p.tenant_id = branch_product_stocks.tenant_id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND (
          COALESCE(p.is_super_admin, false) = true
          OR p.tenant_id = branch_product_stocks.tenant_id
        )
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Stok / Reçete / Tedarikçi / Alış Faturası modülü
-- ============================================================================
-- 1) suppliers           : tedarikçiler
-- 2) ingredients         : hammaddeler (stok takibi)
-- 3) recipes             : ürün → hammadde reçetesi
-- 4) purchase_invoices   : alış faturaları
-- 5) purchase_invoice_items
-- 6) ingredient_movements: stok hareketi log'u (alış / kullanım / sayım)
-- 7) Trigger: alış kalemleri eklendiğinde stok ↑, tedarikçi cari ↑
-- 8) Trigger: order completed olduğunda reçeteye göre stok ↓
-- 9) RLS: tenant izolasyonu
-- ============================================================================

-- TEDARİKÇİLER --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  address text,
  tax_no text,
  current_balance numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS suppliers_tenant_idx ON public.suppliers(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS suppliers_name_idx ON public.suppliers(tenant_id, lower(name));

-- HAMMADDELER ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'kg', -- kg, lt, adet, gr, ml, paket vs.
  current_stock numeric(14,3) NOT NULL DEFAULT 0,
  min_stock numeric(14,3) NOT NULL DEFAULT 0,    -- kritik seviye
  unit_cost numeric(12,2) NOT NULL DEFAULT 0,    -- son alış birim fiyatı
  default_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  barcode text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingredients_tenant_idx ON public.ingredients(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS ingredients_critical_idx
  ON public.ingredients(tenant_id) WHERE current_stock <= min_stock AND is_active = true;
CREATE INDEX IF NOT EXISTS ingredients_name_idx ON public.ingredients(tenant_id, lower(name));

-- REÇETELER -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  quantity numeric(14,4) NOT NULL CHECK (quantity > 0),
  unit text,                -- bilgi amaçlı; ingredient.unit ile aynı tutulması beklenir
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- (product_id, variant_id, ingredient_id) tekilliği — variant NULL durumu için coalesce
CREATE UNIQUE INDEX IF NOT EXISTS recipes_unique_idx
  ON public.recipes(product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid), ingredient_id);
CREATE INDEX IF NOT EXISTS recipes_tenant_idx ON public.recipes(tenant_id);
CREATE INDEX IF NOT EXISTS recipes_ingredient_idx ON public.recipes(ingredient_id);

-- ALIŞ FATURALARI -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  invoice_no text,
  invoice_date date NOT NULL DEFAULT current_date,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'on_account', -- cash | credit_card | bank_transfer | on_account
  notes text,
  status text NOT NULL DEFAULT 'recorded', -- recorded | cancelled
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_invoices_tenant_idx
  ON public.purchase_invoices(tenant_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS purchase_invoices_supplier_idx
  ON public.purchase_invoices(supplier_id, invoice_date DESC);

CREATE TABLE IF NOT EXISTS public.purchase_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_cost numeric(12,2) NOT NULL CHECK (unit_cost >= 0),
  total numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_invoice_items_invoice_idx
  ON public.purchase_invoice_items(invoice_id);

-- HAMMADDE HAREKET LOG'U ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ingredient_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('purchase','sale_consumption','adjustment','waste','transfer')),
  quantity numeric(14,3) NOT NULL,            -- + ise giriş, - ise çıkış
  unit_cost numeric(12,2),
  reference_table text,                        -- 'purchase_invoices' | 'orders' | NULL
  reference_id uuid,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ingredient_movements_tenant_idx
  ON public.ingredient_movements(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ingredient_movements_ingredient_idx
  ON public.ingredient_movements(ingredient_id, created_at DESC);

-- ============================================================================
-- TRIGGER 1: purchase_invoice_items eklendiğinde
--   - ingredients.current_stock += quantity
--   - ingredients.unit_cost = unit_cost (son alış)
--   - ingredient_movements log
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_purchase_invoice_item_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.ingredients
     SET current_stock = current_stock + NEW.quantity,
         unit_cost = NEW.unit_cost,
         updated_at = now()
   WHERE id = NEW.ingredient_id;

  INSERT INTO public.ingredient_movements
    (tenant_id, ingredient_id, movement_type, quantity, unit_cost, reference_table, reference_id, note)
  SELECT NEW.tenant_id, NEW.ingredient_id, 'purchase', NEW.quantity, NEW.unit_cost,
         'purchase_invoices', NEW.invoice_id,
         'Alış faturası kalemi'
  ;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_invoice_item_insert ON public.purchase_invoice_items;
CREATE TRIGGER trg_purchase_invoice_item_insert
  AFTER INSERT ON public.purchase_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_purchase_invoice_item_insert();

-- ============================================================================
-- TRIGGER 2: purchase_invoices INSERT/UPDATE/DELETE → tedarikçi cari bakiyesi
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_purchase_invoice_supplier_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  delta numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'recorded' THEN
      delta := COALESCE(NEW.total_amount,0) - COALESCE(NEW.paid_amount,0);
      UPDATE public.suppliers
         SET current_balance = current_balance + delta,
             updated_at = now()
       WHERE id = NEW.supplier_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Eski etkiyi geri al
    IF OLD.status = 'recorded' THEN
      UPDATE public.suppliers
         SET current_balance = current_balance - (COALESCE(OLD.total_amount,0) - COALESCE(OLD.paid_amount,0)),
             updated_at = now()
       WHERE id = OLD.supplier_id;
    END IF;
    -- Yeni etkiyi uygula
    IF NEW.status = 'recorded' THEN
      UPDATE public.suppliers
         SET current_balance = current_balance + (COALESCE(NEW.total_amount,0) - COALESCE(NEW.paid_amount,0)),
             updated_at = now()
       WHERE id = NEW.supplier_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'recorded' THEN
      UPDATE public.suppliers
         SET current_balance = current_balance - (COALESCE(OLD.total_amount,0) - COALESCE(OLD.paid_amount,0)),
             updated_at = now()
       WHERE id = OLD.supplier_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_invoice_supplier_balance ON public.purchase_invoices;
CREATE TRIGGER trg_purchase_invoice_supplier_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.handle_purchase_invoice_supplier_balance();

-- ============================================================================
-- TRIGGER 3: order completed olduğunda reçeteye göre hammadde stoktan düşür
-- ============================================================================
CREATE OR REPLACE FUNCTION public.deduct_recipe_stock_on_order_complete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rec RECORD;
BEGIN
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN
    -- Daha önce de completed idi, tekrar düşme
    RETURN NEW;
  END IF;

  -- order_items + recipes JOIN → ingredient bazında kullanım toplamı
  FOR rec IN
    SELECT r.ingredient_id,
           SUM(r.quantity * oi.quantity) AS used
      FROM public.order_items oi
      JOIN public.recipes r
        ON r.product_id = oi.product_id
       AND (r.variant_id IS NULL OR r.variant_id = oi.variant_id)
       AND r.tenant_id = oi.tenant_id
     WHERE oi.order_id = NEW.id
     GROUP BY r.ingredient_id
  LOOP
    UPDATE public.ingredients
       SET current_stock = current_stock - rec.used,
           updated_at = now()
     WHERE id = rec.ingredient_id;

    INSERT INTO public.ingredient_movements
      (tenant_id, ingredient_id, movement_type, quantity, reference_table, reference_id, note)
    VALUES
      (NEW.tenant_id, rec.ingredient_id, 'sale_consumption', -rec.used,
       'orders', NEW.id, 'Sipariş tamamlandı: ' || COALESCE(NEW.order_number, NEW.id::text));
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_recipe_deduct ON public.orders;
CREATE TRIGGER trg_orders_recipe_deduct
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.deduct_recipe_stock_on_order_complete();

-- ============================================================================
-- RLS — tenant izolasyonu
-- ============================================================================
ALTER TABLE public.suppliers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_movements   ENABLE ROW LEVEL SECURITY;

-- Helper: aynı tenant'a aitse tam yetki
DROP POLICY IF EXISTS "Tenant members manage suppliers" ON public.suppliers;
CREATE POLICY "Tenant members manage suppliers"
  ON public.suppliers FOR ALL
  USING (tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Tenant members manage ingredients" ON public.ingredients;
CREATE POLICY "Tenant members manage ingredients"
  ON public.ingredients FOR ALL
  USING (tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Tenant members manage recipes" ON public.recipes;
CREATE POLICY "Tenant members manage recipes"
  ON public.recipes FOR ALL
  USING (tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Tenant members manage purchase_invoices" ON public.purchase_invoices;
CREATE POLICY "Tenant members manage purchase_invoices"
  ON public.purchase_invoices FOR ALL
  USING (tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Tenant members manage purchase_invoice_items" ON public.purchase_invoice_items;
CREATE POLICY "Tenant members manage purchase_invoice_items"
  ON public.purchase_invoice_items FOR ALL
  USING (tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()));

DROP POLICY IF EXISTS "Tenant members manage ingredient_movements" ON public.ingredient_movements;
CREATE POLICY "Tenant members manage ingredient_movements"
  ON public.ingredient_movements FOR ALL
  USING (tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()));

-- Realtime publication (opsiyonel — kritik stok rozeti gerçek zamanlı güncellensin)
ALTER PUBLICATION supabase_realtime ADD TABLE public.ingredients;
ALTER PUBLICATION supabase_realtime ADD TABLE public.suppliers;
ALTER TABLE public.ingredients REPLICA IDENTITY FULL;
ALTER TABLE public.suppliers   REPLICA IDENTITY FULL;

NOTIFY pgrst, 'reload schema';

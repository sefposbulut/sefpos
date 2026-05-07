/*
  OrderPanel ve ORDER_ITEMS_PANEL_SELECT şu kolonları bekliyor:
  - order_items: tax_rate, discount_amount, total_amount (+ mevcut subtotal NOT NULL)
  - orders: tax_amount, discount_amount, created_by (legacy: tax, total, total_amount)
  - products: tax_rate (ürün gömülü seçiminde)
  Ayrıca satır toplamları için subtotal ↔ total_amount senkronu.
*/

-- products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tax_rate numeric(5, 2) DEFAULT 20;

UPDATE public.products SET tax_rate = 20 WHERE tax_rate IS NULL;

-- orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tax_amount numeric(12, 2) DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12, 2) DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.orders SET tax_amount = COALESCE(tax, 0) WHERE tax_amount IS NULL OR (tax_amount = 0 AND COALESCE(tax, 0) <> 0);
UPDATE public.orders SET discount_amount = 0 WHERE discount_amount IS NULL;

-- order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS total_amount numeric(12, 2);

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS tax_rate numeric(5, 2) DEFAULT 20;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12, 2) DEFAULT 0;

UPDATE public.order_items SET total_amount = subtotal WHERE total_amount IS NULL;
UPDATE public.order_items SET tax_rate = 20 WHERE tax_rate IS NULL;
UPDATE public.order_items SET discount_amount = 0 WHERE discount_amount IS NULL;

CREATE OR REPLACE FUNCTION public.sync_orders_legacy_money_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.total_amount IS NULL OR NEW.total_amount = 0 THEN
      NEW.total_amount := COALESCE(NEW.total, 0);
    END IF;
    NEW.total := NEW.total_amount;

    IF NEW.tax_amount IS NULL THEN NEW.tax_amount := 0; END IF;
    IF NEW.tax IS NULL OR NEW.tax = 0 THEN
      NEW.tax := NEW.tax_amount;
    ELSE
      NEW.tax_amount := COALESCE(NEW.tax, NEW.tax_amount, 0);
    END IF;

    IF NEW.discount_amount IS NULL THEN NEW.discount_amount := 0; END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
      NEW.total := NEW.total_amount;
    ELSIF NEW.total IS DISTINCT FROM OLD.total THEN
      NEW.total_amount := COALESCE(NEW.total, NEW.total_amount, 0);
    END IF;

    IF NEW.tax_amount IS DISTINCT FROM OLD.tax_amount THEN
      NEW.tax := NEW.tax_amount;
    ELSIF NEW.tax IS DISTINCT FROM OLD.tax THEN
      NEW.tax_amount := COALESCE(NEW.tax, NEW.tax_amount, 0);
    END IF;

    IF NEW.discount_amount IS NULL THEN NEW.discount_amount := 0; END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_orders_total_columns_trg ON public.orders;
DROP TRIGGER IF EXISTS sync_orders_legacy_money_trg ON public.orders;
CREATE TRIGGER sync_orders_legacy_money_trg
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_orders_legacy_money_columns();

DROP FUNCTION IF EXISTS public.sync_orders_total_columns();

CREATE OR REPLACE FUNCTION public.sync_order_items_line_amounts()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tax_rate IS NULL THEN NEW.tax_rate := 20; END IF;
  IF NEW.discount_amount IS NULL THEN NEW.discount_amount := 0; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.subtotal IS NULL OR NEW.subtotal = 0 THEN
      NEW.subtotal := COALESCE(NEW.total_amount, 0);
    END IF;
    IF NEW.total_amount IS NULL OR NEW.total_amount = 0 THEN
      NEW.total_amount := NEW.subtotal;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
      NEW.subtotal := NEW.total_amount;
    ELSIF NEW.subtotal IS DISTINCT FROM OLD.subtotal THEN
      NEW.total_amount := NEW.subtotal;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_order_items_line_amounts_trg ON public.order_items;
CREATE TRIGGER sync_order_items_line_amounts_trg
BEFORE INSERT OR UPDATE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.sync_order_items_line_amounts();

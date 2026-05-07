/*
  Eski şemada `orders.total` var, yeni uygulama her yerde `orders.total_amount`
  kullanıyor. PostgREST embed (orders!fk(...total_amount)) çağrısı 400 'column
  total_amount does not exist' dönüyordu; bu da masaların boş gelmesine yol
  açıyordu. Çözüm: `total_amount` kolonunu ekle, mevcut `total` değerini kopyala
  ve iki yön için trigger ile senkronize tut.
*/

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS total_amount numeric(12, 2) DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'total'
  ) THEN
    UPDATE public.orders
       SET total_amount = COALESCE(total, 0)
     WHERE total_amount IS NULL
        OR (total_amount = 0 AND COALESCE(total, 0) <> 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_orders_total_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.total_amount IS NULL OR NEW.total_amount = 0 THEN
      NEW.total_amount := COALESCE(NEW.total, 0);
    END IF;
    NEW.total := NEW.total_amount;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
      NEW.total := NEW.total_amount;
    ELSIF NEW.total IS DISTINCT FROM OLD.total THEN
      NEW.total_amount := NEW.total;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_orders_total_columns_trg ON public.orders;
CREATE TRIGGER sync_orders_total_columns_trg
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_orders_total_columns();

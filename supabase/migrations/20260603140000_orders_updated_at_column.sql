/*
  Paket servis yedek poll (TakeawayOrders) created_at kullanır; bazı eski şemalarda
  orders.updated_at hiç yoktu → PostgREST 400. Kolon yoksa eklenir.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.orders
      ADD COLUMN updated_at timestamptz DEFAULT now();
    UPDATE public.orders SET updated_at = COALESCE(completed_at, created_at, now())
    WHERE updated_at IS NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_orders_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_orders_updated_at();

NOTIFY pgrst, 'reload schema';

/*
  Paket sipariş formunun (DeliveryOrderForm.tsx) yazdığı kolonlardan bazıları
  eski kurulumlarda orders tablosunda eksik kalıyor. Eksikse ekler; varsa atlar.
  En kritik eksik: payment_method (PostgREST "schema cache" hatası bunda çıkıyor).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'payment_method'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN payment_method text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'payment_collected'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN payment_collected boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN payment_status text DEFAULT 'unpaid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'order_subtype'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN order_subtype text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'estimated_delivery_minutes'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN estimated_delivery_minutes integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'delivery_status'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN delivery_status text DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'customer_name'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN customer_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'customer_phone'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN customer_phone text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'delivery_address'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN delivery_address text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'delivery_note'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN delivery_note text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'waiter_name'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN waiter_name text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON public.orders(payment_method);

NOTIFY pgrst, 'reload schema';

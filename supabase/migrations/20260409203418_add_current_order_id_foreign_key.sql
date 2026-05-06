/*
  # Add foreign key for current_order_id on restaurant_tables

  Adds the missing foreign key constraint so that Supabase can resolve
  the orders join used in the TableGrid query.
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'restaurant_tables'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'orders'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'restaurant_tables_current_order_id_fkey'
      AND conrelid = 'public.restaurant_tables'::regclass
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'restaurant_tables' AND column_name = 'current_order_id'
  ) THEN
    ALTER TABLE public.restaurant_tables
      ADD CONSTRAINT restaurant_tables_current_order_id_fkey
      FOREIGN KEY (current_order_id)
      REFERENCES public.orders(id)
      ON DELETE SET NULL;
  END IF;
END $$;

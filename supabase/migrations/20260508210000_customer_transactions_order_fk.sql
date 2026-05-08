-- customer_transactions.order_id -> orders(id) FK
-- PostgREST embed ve referential integrity icin. Onceki migrationlarda order_id
-- kolonu vardi ama FK yoktu; bu yuzden supabase-js .select('order:orders(...)') hata veriyordu.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_transactions_order_id_fkey'
  ) THEN
    ALTER TABLE public.customer_transactions
      ADD CONSTRAINT customer_transactions_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

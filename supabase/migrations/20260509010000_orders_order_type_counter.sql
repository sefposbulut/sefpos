-- Hızlı Satış (tezgâh) modu için orders.order_type'a 'counter' değerini ekler.
-- Mevcut check constraint sadece dine_in/takeaway/delivery'e izin veriyordu.

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_type_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_type_check
  CHECK (order_type = ANY (ARRAY['dine_in'::text, 'takeaway'::text, 'delivery'::text, 'counter'::text]));

NOTIFY pgrst, 'reload schema';

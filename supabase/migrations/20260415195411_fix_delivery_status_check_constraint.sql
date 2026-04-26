/*
  # Fix delivery_status check constraint on orders table

  ## Problem
  The existing check constraint only allows: pending, assigned, picked_up, delivered, failed
  But the application uses: pending, preparing, ready, on_the_way, delivered, cancelled, assigned

  ## Changes
  - Drop the old restrictive check constraint
  - Add a new constraint that includes all valid delivery statuses used in the app
*/

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_status_check;

ALTER TABLE orders ADD CONSTRAINT orders_delivery_status_check
  CHECK (delivery_status = ANY (ARRAY[
    'pending'::text,
    'preparing'::text,
    'ready'::text,
    'assigned'::text,
    'on_the_way'::text,
    'picked_up'::text,
    'delivered'::text,
    'failed'::text,
    'cancelled'::text
  ]));

/*
  # Add foreign key for current_order_id on restaurant_tables

  Adds the missing foreign key constraint so that Supabase can resolve
  the orders join used in the TableGrid query.
*/

ALTER TABLE restaurant_tables
  ADD CONSTRAINT restaurant_tables_current_order_id_fkey
  FOREIGN KEY (current_order_id)
  REFERENCES orders(id)
  ON DELETE SET NULL;

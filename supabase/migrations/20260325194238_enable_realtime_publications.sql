/*
  # Enable Realtime for ŞEFPOS Tables

  1. Changes
    - Enable realtime on all core tables (products, orders, order_items, restaurant_tables)
    - This allows instant synchronization across all connected clients
    - No lag between users when products/orders are added or updated

  2. Performance
    - Uses Supabase's optimized realtime infrastructure
    - No polling required - instant push notifications
    - Scales to hundreds of concurrent connections
*/

-- Enable realtime on products table
ALTER PUBLICATION supabase_realtime ADD TABLE products;

-- Enable realtime on orders table
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- Enable realtime on order_items table
ALTER PUBLICATION supabase_realtime ADD TABLE order_items;

-- Enable realtime on restaurant_tables table
ALTER PUBLICATION supabase_realtime ADD TABLE restaurant_tables;

-- Enable realtime on categories table
ALTER PUBLICATION supabase_realtime ADD TABLE categories;
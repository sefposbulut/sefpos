/*
  # Yemeksepeti / Delivery Hero Direct Integration Fields

  ## Summary
  Adds fields required for Delivery Hero POS Plugin API (Direct Integration).

  ## Changes

  ### online_orders table
  - `remote_order_id` - The POS-side order ID returned in ACK response (required for callback URLs)
  - `expedition_type` - "delivery" or "pickup" from Delivery Hero
  - `callback_urls` - JSONB storing all Delivery Hero callback URLs for this order
    (orderAcceptedUrl, orderRejectedUrl, orderPreparedUrl, etc.)
  - `dh_order_token` - Delivery Hero's unique middleware token for the order
  - `dh_platform_restaurant_id` - The restaurant ID on DH platform
  - `dh_raw_payload` - Full raw JSON from Delivery Hero (for debugging)
  - `rider_pickup_time` - Expected rider pickup time (from DH)

  ### online_order_items table  
  - `toppings` - JSONB array of toppings/modifiers for this item
  - `remote_code` - POS product code mapping (remoteCode from DH)
  - `dh_product_id` - Delivery Hero platform product ID

  ### online_order_platforms table
  - `webhook_secret` - Secret for validating incoming Delivery Hero JWT
  - `remote_id` - The remoteId assigned by Delivery Hero middleware for this restaurant
  - `middleware_url` - Delivery Hero middleware base URL for sending callbacks
*/

-- Add Delivery Hero specific fields to online_orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'online_orders' AND column_name = 'remote_order_id'
  ) THEN
    ALTER TABLE online_orders ADD COLUMN remote_order_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'online_orders' AND column_name = 'expedition_type'
  ) THEN
    ALTER TABLE online_orders ADD COLUMN expedition_type text DEFAULT 'delivery';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'online_orders' AND column_name = 'callback_urls'
  ) THEN
    ALTER TABLE online_orders ADD COLUMN callback_urls jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'online_orders' AND column_name = 'dh_order_token'
  ) THEN
    ALTER TABLE online_orders ADD COLUMN dh_order_token text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'online_orders' AND column_name = 'dh_platform_restaurant_id'
  ) THEN
    ALTER TABLE online_orders ADD COLUMN dh_platform_restaurant_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'online_orders' AND column_name = 'dh_raw_payload'
  ) THEN
    ALTER TABLE online_orders ADD COLUMN dh_raw_payload jsonb DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'online_orders' AND column_name = 'rider_pickup_time'
  ) THEN
    ALTER TABLE online_orders ADD COLUMN rider_pickup_time timestamptz DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'online_orders' AND column_name = 'payment_type'
  ) THEN
    ALTER TABLE online_orders ADD COLUMN payment_type text DEFAULT 'paid';
  END IF;
END $$;

-- Add Delivery Hero specific fields to online_order_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'online_order_items' AND column_name = 'toppings'
  ) THEN
    ALTER TABLE online_order_items ADD COLUMN toppings jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'online_order_items' AND column_name = 'remote_code'
  ) THEN
    ALTER TABLE online_order_items ADD COLUMN remote_code text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'online_order_items' AND column_name = 'dh_product_id'
  ) THEN
    ALTER TABLE online_order_items ADD COLUMN dh_product_id text DEFAULT NULL;
  END IF;
END $$;

-- Add Delivery Hero integration fields to online_order_platforms
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'online_order_platforms' AND column_name = 'webhook_secret'
  ) THEN
    ALTER TABLE online_order_platforms ADD COLUMN webhook_secret text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'online_order_platforms' AND column_name = 'remote_id'
  ) THEN
    ALTER TABLE online_order_platforms ADD COLUMN remote_id text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'online_order_platforms' AND column_name = 'middleware_url'
  ) THEN
    ALTER TABLE online_order_platforms ADD COLUMN middleware_url text DEFAULT NULL;
  END IF;
END $$;

-- Index for fast lookup by dh_order_token
CREATE INDEX IF NOT EXISTS idx_online_orders_dh_token ON online_orders(dh_order_token) WHERE dh_order_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_online_orders_remote_order_id ON online_orders(remote_order_id) WHERE remote_order_id IS NOT NULL;

/*
  # Add Delivery Hero Middleware API Credentials

  ## Summary
  Adds fields required to authenticate against the Delivery Hero POS Middleware API
  (POST /v2/login, POST /v2/order/status/{orderToken}, etc.)

  ## Changes

  ### online_order_platforms table
  - `middleware_username` - Username for POST /v2/login
  - `middleware_password` - Password for POST /v2/login
  - `middleware_token` - Cached JWT access_token
  - `middleware_token_expires_at` - When the token expires (for auto-refresh)
  - `middleware_chain_code` - Chain code used for GET /v2/chains/{chainCode}/orders
  - `middleware_vendor_code` - Vendor code used in menu import requests

  Note: middleware_url already added in previous migration.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'online_order_platforms' AND column_name = 'middleware_username'
  ) THEN
    ALTER TABLE online_order_platforms ADD COLUMN middleware_username text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'online_order_platforms' AND column_name = 'middleware_password'
  ) THEN
    ALTER TABLE online_order_platforms ADD COLUMN middleware_password text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'online_order_platforms' AND column_name = 'middleware_token'
  ) THEN
    ALTER TABLE online_order_platforms ADD COLUMN middleware_token text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'online_order_platforms' AND column_name = 'middleware_token_expires_at'
  ) THEN
    ALTER TABLE online_order_platforms ADD COLUMN middleware_token_expires_at timestamptz DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'online_order_platforms' AND column_name = 'middleware_chain_code'
  ) THEN
    ALTER TABLE online_order_platforms ADD COLUMN middleware_chain_code text DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'online_order_platforms' AND column_name = 'middleware_vendor_code'
  ) THEN
    ALTER TABLE online_order_platforms ADD COLUMN middleware_vendor_code text DEFAULT NULL;
  END IF;
END $$;

/*
  # Getir Food Integration Fields

  ## Summary
  Adds the columns required for the GetirYemek Restaurant API integration
  (https://developers.getir.com/food/documentation/introduction).

  ## Changes

  ### online_order_platforms
  - `getir_environment`           Which Getir gateway to call ('development' | 'production'). Default 'development'.
  - `getir_app_secret_key`        Per-app secret, mirrors settings.app_secret_key but as a top-level column for easier RLS / RPC use.
  - `getir_restaurant_secret_key` Per-restaurant secret (mirrors settings.restaurant_secret_key).
  - `getir_restaurant_id`         Restaurant ObjectId on Getir side.
  - `getir_token`                 Cached JWT from POST /auth/login (TTL: 1 hour).
  - `getir_token_expires_at`      Token expiry timestamp.
  - `getir_pos_status`            100 = active, 200 = passive. Mirrors Getir POS status.
  - `getir_x_api_key`             Per-tenant random secret used to validate incoming Getir webhooks.

  ### online_orders
  - `getir_status_code`           Numeric Getir order status (325/350/400/500/550/700/800/900/1500/1600).
  - `getir_is_scheduled`          true for ileri tarihli sipariş.
  - `getir_scheduled_at`          Scheduled delivery time (when isScheduled=true).
  - `getir_delivery_type`         1 = Getir kuryesi, 2 = Restoran kuryesi.
  - `getir_verification_code`     Short verification code printed on the kitchen receipt (e.g. "h593").
  - `getir_masked_phone`          Masked customer phone (0850 ...). Real number is hidden by Getir.
  - `getir_raw_payload`           Full raw JSON received from webhook or poll (for debugging + audit).
  - `getir_supplier_support_rate` Ortak kampanya: indirimin % kaçı restoran tarafından karşılanır.
  - `getir_total_discount`        Toplam indirim tutarı (TL).
  - `getir_total_discounted_price` Müşteriden tahsil edilen tutar (TL, after restaurant-supported discount).
  - `getir_courier_status`        Getir kurye statüsü (100-1000) — Getir Getirsin siparişlerinde.
  - `getir_cancel_reason_id`      Cancel reason id when cancelled (5f05... gibi).
  - `getir_cancel_note`           Free text note for cancel.

  All changes are idempotent (IF NOT EXISTS).
*/

DO $$
BEGIN
  -- online_order_platforms ---------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_order_platforms' AND column_name='getir_environment') THEN
    ALTER TABLE online_order_platforms ADD COLUMN getir_environment text DEFAULT 'development';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_order_platforms' AND column_name='getir_app_secret_key') THEN
    ALTER TABLE online_order_platforms ADD COLUMN getir_app_secret_key text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_order_platforms' AND column_name='getir_restaurant_secret_key') THEN
    ALTER TABLE online_order_platforms ADD COLUMN getir_restaurant_secret_key text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_order_platforms' AND column_name='getir_restaurant_id') THEN
    ALTER TABLE online_order_platforms ADD COLUMN getir_restaurant_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_order_platforms' AND column_name='getir_token') THEN
    ALTER TABLE online_order_platforms ADD COLUMN getir_token text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_order_platforms' AND column_name='getir_token_expires_at') THEN
    ALTER TABLE online_order_platforms ADD COLUMN getir_token_expires_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_order_platforms' AND column_name='getir_pos_status') THEN
    ALTER TABLE online_order_platforms ADD COLUMN getir_pos_status int DEFAULT 200;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_order_platforms' AND column_name='getir_x_api_key') THEN
    ALTER TABLE online_order_platforms ADD COLUMN getir_x_api_key text;
  END IF;

  -- online_orders ------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_orders' AND column_name='getir_status_code') THEN
    ALTER TABLE online_orders ADD COLUMN getir_status_code int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_orders' AND column_name='getir_is_scheduled') THEN
    ALTER TABLE online_orders ADD COLUMN getir_is_scheduled boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_orders' AND column_name='getir_scheduled_at') THEN
    ALTER TABLE online_orders ADD COLUMN getir_scheduled_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_orders' AND column_name='getir_delivery_type') THEN
    ALTER TABLE online_orders ADD COLUMN getir_delivery_type int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_orders' AND column_name='getir_verification_code') THEN
    ALTER TABLE online_orders ADD COLUMN getir_verification_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_orders' AND column_name='getir_masked_phone') THEN
    ALTER TABLE online_orders ADD COLUMN getir_masked_phone text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_orders' AND column_name='getir_raw_payload') THEN
    ALTER TABLE online_orders ADD COLUMN getir_raw_payload jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_orders' AND column_name='getir_supplier_support_rate') THEN
    ALTER TABLE online_orders ADD COLUMN getir_supplier_support_rate numeric(5,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_orders' AND column_name='getir_total_discount') THEN
    ALTER TABLE online_orders ADD COLUMN getir_total_discount numeric(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_orders' AND column_name='getir_total_discounted_price') THEN
    ALTER TABLE online_orders ADD COLUMN getir_total_discounted_price numeric(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_orders' AND column_name='getir_courier_status') THEN
    ALTER TABLE online_orders ADD COLUMN getir_courier_status int;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_orders' AND column_name='getir_cancel_reason_id') THEN
    ALTER TABLE online_orders ADD COLUMN getir_cancel_reason_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='online_orders' AND column_name='getir_cancel_note') THEN
    ALTER TABLE online_orders ADD COLUMN getir_cancel_note text;
  END IF;
END $$;

-- Fast lookup by Getir status code (e.g. for new-order polling fallback)
CREATE INDEX IF NOT EXISTS idx_online_orders_getir_status
  ON online_orders(getir_status_code)
  WHERE getir_status_code IS NOT NULL;

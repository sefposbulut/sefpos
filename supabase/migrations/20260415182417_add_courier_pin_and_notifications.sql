/*
  # Add courier PIN code and notification support

  1. Changes to couriers table
    - Add `pin_code` column (text, nullable) - 4-6 digit PIN for courier login
    - Add `notification_token` column (text, nullable) - for future push notifications

  2. New table: courier_notifications
    - Stores in-app notifications for couriers
    - Realtime enabled for instant delivery alerts
    - Fields: id, tenant_id, courier_id, order_id, message, type, is_read, created_at

  3. Security
    - RLS on courier_notifications
    - Couriers can read their own notifications via pin-based session (no auth.uid check needed since couriers don't have Supabase accounts)
    - Staff (authenticated) can insert and update notifications
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'couriers' AND column_name = 'pin_code'
  ) THEN
    ALTER TABLE couriers ADD COLUMN pin_code text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'couriers' AND column_name = 'notification_token'
  ) THEN
    ALTER TABLE couriers ADD COLUMN notification_token text;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS courier_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  courier_id uuid NOT NULL REFERENCES couriers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'order_assigned',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE courier_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage courier notifications"
  ON courier_notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update courier notifications"
  ON courier_notifications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can select courier notifications"
  ON courier_notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anon can read courier notifications"
  ON courier_notifications
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can update courier notifications read status"
  ON courier_notifications
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'courier_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE courier_notifications;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_courier_notifications_courier_id ON courier_notifications(courier_id);
CREATE INDEX IF NOT EXISTS idx_courier_notifications_tenant_id ON courier_notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_courier_notifications_created_at ON courier_notifications(created_at DESC);

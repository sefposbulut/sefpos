/*
  # Add payment_locked_at timestamp and auto-unlock function

  ## Changes
  1. Add `payment_locked_at` column to `restaurant_tables`
     - Stores when the payment lock was set
     - Used to detect stale locks (older than 10 minutes)
  
  2. Add `unlock_stale_payment_locks()` function
     - Automatically unlocks tables where payment_locked_at is older than 10 minutes
     - Prevents permanent locks caused by crashes or connection drops
  
  3. Clear all existing stale locks on migration run
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'restaurant_tables' AND column_name = 'payment_locked_at'
  ) THEN
    ALTER TABLE restaurant_tables ADD COLUMN payment_locked_at timestamptz DEFAULT NULL;
  END IF;
END $$;

UPDATE restaurant_tables
SET payment_locked = false, payment_locked_at = NULL
WHERE payment_locked = true;

CREATE OR REPLACE FUNCTION unlock_stale_payment_locks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE restaurant_tables
  SET payment_locked = false, payment_locked_at = NULL
  WHERE payment_locked = true
    AND (
      payment_locked_at IS NULL
      OR payment_locked_at < now() - INTERVAL '10 minutes'
    );
END;
$$;

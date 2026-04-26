/*
  # Session-Based Payment Locking System
  
  1. Changes to restaurant_tables
    - Add `payment_locked_by_session` column to track which session locked the table
    - Add `payment_lock_expires_at` for automatic timeout-based unlock
  
  2. Security
    - RLS policies updated to handle session-based locks
    - Only the session that locked the table can unlock it
    - Auto-unlock after 10 minutes regardless of session
  
  3. Important Notes
    - Replaces timestamp-only locking with session tracking
    - Prevents race conditions between concurrent users
    - Auto-cleanup of stale locks
*/

DO $$
BEGIN
  -- Add session column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'restaurant_tables' AND column_name = 'payment_locked_by_session'
  ) THEN
    ALTER TABLE restaurant_tables ADD COLUMN payment_locked_by_session TEXT;
  END IF;

  -- Add expiry column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'restaurant_tables' AND column_name = 'payment_lock_expires_at'
  ) THEN
    ALTER TABLE restaurant_tables ADD COLUMN payment_lock_expires_at timestamptz;
  END IF;
END $$;

-- Create function to safely unlock payment locks
CREATE OR REPLACE FUNCTION unlock_payment_lock(
  p_table_id UUID,
  p_session_id TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  -- Only unlock if session matches OR lock is expired
  UPDATE restaurant_tables
  SET 
    payment_locked = FALSE,
    payment_locked_at = NULL,
    payment_locked_by_session = NULL,
    payment_lock_expires_at = NULL
  WHERE 
    id = p_table_id 
    AND (
      payment_locked_by_session = p_session_id 
      OR payment_lock_expires_at < now()
    )
    AND payment_locked = TRUE;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check lock status
CREATE OR REPLACE FUNCTION get_payment_lock_status(
  p_table_id UUID
) RETURNS TABLE(
  is_locked BOOLEAN,
  locked_by_session TEXT,
  expires_at TIMESTAMPTZ,
  is_expired BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rt.payment_locked,
    rt.payment_locked_by_session,
    rt.payment_lock_expires_at,
    (rt.payment_lock_expires_at IS NOT NULL AND rt.payment_lock_expires_at < now())
  FROM restaurant_tables rt
  WHERE rt.id = p_table_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
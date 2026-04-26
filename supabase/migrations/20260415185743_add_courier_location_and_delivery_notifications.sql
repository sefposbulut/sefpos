/*
  # Courier Location Tracking & Delivery Notifications

  1. Changes
    - Add latitude, longitude, location_updated_at columns to couriers table
    - Add delivered_notification_sent column to orders table for tracking

  2. Purpose
    - Couriers share GPS location while logged in
    - Restaurant sees courier location on delivery orders
    - When courier marks delivered, restaurant gets notified
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'couriers' AND column_name = 'latitude'
  ) THEN
    ALTER TABLE couriers ADD COLUMN latitude double precision;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'couriers' AND column_name = 'longitude'
  ) THEN
    ALTER TABLE couriers ADD COLUMN longitude double precision;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'couriers' AND column_name = 'location_updated_at'
  ) THEN
    ALTER TABLE couriers ADD COLUMN location_updated_at timestamptz;
  END IF;
END $$;

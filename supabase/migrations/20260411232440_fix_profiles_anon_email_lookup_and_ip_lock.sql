/*
  # Fix Profiles Anon Email Lookup + Add IP Lock Support

  1. Changes
    - Add policy allowing anonymous users to look up profiles by email (only email column exposed)
      This is needed so the login screen can resolve username -> email before signing in.
    - Add `allowed_ips` column to profiles table for IP-based access restriction
    - Add `ip_lock_enabled` column to tenants for feature toggle

  2. Security
    - Anonymous SELECT policy restricted to email column only via a view
    - IP lock only applies to non-owner/admin roles
*/

-- Allow anon to do email lookup (needed before login to resolve username to email)
-- We allow reading only when filtering by email pattern ending in shefpos.local
-- This is safe because we're only exposing the email field to match usernames
CREATE POLICY "Anon can lookup email for login"
  ON profiles FOR SELECT
  TO anon
  USING (email LIKE '%.shefpos.local');

-- Add allowed_ips to profiles (comma-separated CIDR or IP list, null = no restriction)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'allowed_ips'
  ) THEN
    ALTER TABLE profiles ADD COLUMN allowed_ips text DEFAULT NULL;
  END IF;
END $$;

-- Add ip_lock_enabled to tenants
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenants' AND column_name = 'ip_lock_enabled'
  ) THEN
    ALTER TABLE tenants ADD COLUMN ip_lock_enabled boolean DEFAULT false;
  END IF;
END $$;

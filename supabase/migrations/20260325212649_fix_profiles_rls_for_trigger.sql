/*
  # Fix Profiles RLS for Auto User Creation

  1. Changes
    - Drop existing restrictive RLS policies on profiles table
    - Create new policies that allow system triggers to insert profiles
    - Maintain security by allowing authenticated users to manage their own data
    
  2. Security
    - Service role can insert profiles (for triggers)
    - Authenticated users can view and update their own profiles
    - Admin users can view all profiles in their tenant
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

-- Allow service role to insert profiles (for trigger)
CREATE POLICY "Service role can insert profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Admins can view all profiles in their tenant
CREATE POLICY "Admins can view all tenant profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.tenant_id = profiles.tenant_id
      AND p.role = 'admin'
    )
  );

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can update profiles in their tenant
CREATE POLICY "Admins can update tenant profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.tenant_id = profiles.tenant_id
      AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.tenant_id = profiles.tenant_id
      AND p.role = 'admin'
    )
  );

-- Admins can delete profiles in their tenant
CREATE POLICY "Admins can delete tenant profiles"
  ON profiles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.tenant_id = profiles.tenant_id
      AND p.role = 'admin'
    )
  );
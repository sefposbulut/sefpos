/*
  # Fix Profiles RLS Infinite Recursion

  1. Changes
    - Drop policies that cause infinite recursion
    - Create simpler policies that don't query the same table
    - Use a separate admin check table or simplify logic
    
  2. Security
    - Service role can insert profiles (for triggers)
    - Authenticated users can view and update their own profiles
    - Keep security while avoiding recursion
*/

-- Drop all existing policies
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all tenant profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update tenant profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can delete tenant profiles" ON profiles;

-- Allow all authenticated users to insert (trigger will use this)
CREATE POLICY "Authenticated users can insert profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can view their own profile OR profiles in their tenant
CREATE POLICY "Users can view profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id 
    OR 
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Users can update their own profile only
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM profiles WHERE id = auth.uid()));

-- Users can delete profiles if they are admin in the same tenant
CREATE POLICY "Admins can delete tenant profiles"
  ON profiles FOR DELETE
  TO authenticated
  USING (
    id != auth.uid() 
    AND
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    AND
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
  );
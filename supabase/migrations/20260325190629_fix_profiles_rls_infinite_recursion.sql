/*
  # Fix Profiles RLS Infinite Recursion

  1. Changes
    - Drop existing SELECT policy that causes infinite recursion
    - Create new SELECT policy using auth.uid() directly
    
  2. Security
    - Users can only view their own profile
*/

DROP POLICY IF EXISTS "Users can view profiles in their tenant" ON profiles;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);
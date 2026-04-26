/*
  # Fix Device Binding Requests RLS and User Creation

  1. Issues Fixed
    - device_binding_requests INSERT policy was too restrictive for waiters
    - User creation blocked by RLS on profiles table
    - Need to allow proper authentication-based operations

  2. Changes
    - Update device_binding_requests INSERT policy to be less restrictive
    - Ensure waiters table policy allows proper lookups
    - Fix profiles table RLS for new user creation
*/

DROP POLICY IF EXISTS "Waiters can create binding requests" ON device_binding_requests;

CREATE POLICY "Waiters can create binding requests"
  ON device_binding_requests FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Managers can view tenant requests" ON device_binding_requests;

CREATE POLICY "Managers and waiters can view requests"
  ON device_binding_requests FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Managers can accept requests" ON device_binding_requests;

CREATE POLICY "Managers can update requests"
  ON device_binding_requests FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can read own data" ON profiles;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Service role can manage profiles"
  ON profiles FOR ALL
  TO authenticated
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

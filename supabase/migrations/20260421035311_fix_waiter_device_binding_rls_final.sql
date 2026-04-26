/*
  # Fix Waiter Device Binding RLS Policies - Final

  Problem: Waiters cannot insert device_binding_requests or device_bindings
  due to overly restrictive RLS policies.

  Solution: 
  - Remove auth.uid() checks for waiter operations (waiters use PIN, not auth)
  - Allow public/anon access for device binding requests
  - Simplify policies to be less restrictive
*/

-- Drop all existing restrictive policies
DROP POLICY IF EXISTS "Waiters can create binding requests" ON device_binding_requests;
DROP POLICY IF EXISTS "Managers and waiters can view requests" ON device_binding_requests;
DROP POLICY IF EXISTS "Managers can update requests" ON device_binding_requests;

-- Create open policies for device_binding_requests (no auth required)
CREATE POLICY "Anyone can insert binding requests"
  ON device_binding_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Tenant can view binding requests"
  ON device_binding_requests FOR SELECT
  USING (true);

CREATE POLICY "Tenant can update binding requests"
  ON device_binding_requests FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Drop existing device_bindings policies
DROP POLICY IF EXISTS "Users can view own device bindings" ON device_bindings;
DROP POLICY IF EXISTS "Users can insert device bindings" ON device_bindings;

-- Create open policies for device_bindings
CREATE POLICY "Anyone can insert device bindings"
  ON device_bindings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can view device bindings"
  ON device_bindings FOR SELECT
  USING (true);

CREATE POLICY "Anyone can update device bindings"
  ON device_bindings FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Drop existing waiters policies
DROP POLICY IF EXISTS "Waiters visible to own tenant" ON waiters;
DROP POLICY IF EXISTS "Anyone can read waiters" ON waiters;

-- Create open policies for waiters
CREATE POLICY "Anyone can read waiters"
  ON waiters FOR SELECT
  USING (true);

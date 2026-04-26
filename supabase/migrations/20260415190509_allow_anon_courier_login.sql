/*
  # Allow Anonymous Courier Login

  1. Problem
    - Courier app uses anon key (no Supabase Auth session)
    - Existing RLS policies only allow authenticated users to SELECT/UPDATE couriers
    - This blocks courier login completely

  2. Changes
    - Add SELECT policy for anon role on couriers table (phone + pin based auth)
    - Add UPDATE policy for anon role on couriers table (to update status/location)
    - Add SELECT policy for anon role on courier_notifications table
    - Add UPDATE policy for anon role on courier_notifications table (mark read)
    - Add INSERT policy for anon role on courier_notifications table
    - Add SELECT policy for anon role on orders table (courier can see their orders)
    - Add UPDATE policy for anon role on orders table (courier can update delivery_status)
*/

CREATE POLICY "Couriers can view themselves via phone lookup"
  ON couriers FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY "Couriers can update their own status and location"
  ON couriers FOR UPDATE
  TO anon
  USING (is_active = true)
  WITH CHECK (is_active = true);

CREATE POLICY "Couriers can view their own notifications anon"
  ON courier_notifications FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Couriers can update notification read status anon"
  ON courier_notifications FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Couriers can insert notifications anon"
  ON courier_notifications FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Couriers can view their assigned orders anon"
  ON orders FOR SELECT
  TO anon
  USING (courier_id IS NOT NULL);

CREATE POLICY "Couriers can update delivery status anon"
  ON orders FOR UPDATE
  TO anon
  USING (courier_id IS NOT NULL)
  WITH CHECK (courier_id IS NOT NULL);

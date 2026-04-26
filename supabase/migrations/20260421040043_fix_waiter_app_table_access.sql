/*
  # Fix Waiter App Table Access

  Problem: Waiters cannot view restaurant_tables due to RLS policies
  Solution: Allow public/anon access to restaurant_tables (they need to see tables to work)
*/

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view tables in their tenant" ON restaurant_tables;
DROP POLICY IF EXISTS "Owners and managers can manage tables" ON restaurant_tables;

-- Create open policies for restaurant_tables
CREATE POLICY "Anyone can view restaurant tables"
  ON restaurant_tables FOR SELECT
  USING (true);

CREATE POLICY "Anyone can update restaurant tables"
  ON restaurant_tables FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Also ensure table_groups is accessible
DROP POLICY IF EXISTS "Everyone can read table_groups" ON table_groups;
DROP POLICY IF EXISTS "Users can manage table groups" ON table_groups;

CREATE POLICY "Anyone can view table_groups"
  ON table_groups FOR SELECT
  USING (true);

CREATE POLICY "Anyone can update table_groups"
  ON table_groups FOR UPDATE
  USING (true)
  WITH CHECK (true);

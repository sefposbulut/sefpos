/*
  # Add Table Groups and Enhanced Table Management

  1. New Tables
    - `table_groups` - Masa grupları (Salon, Bahçe, vb.)
      - `id` (uuid, primary key)
      - `tenant_id` (uuid, references tenants)
      - `name` (text) - Grup adı
      - `prefix` (text) - Masa öneki (S, B, vb.)
      - `color` (text) - Grup rengi
      - `created_at` (timestamp)

  2. Table Modifications
    - Add `group_id` to restaurant_tables
    - Add `session_start` to track when customers sat down

  3. Security
    - Enable RLS on table_groups
    - Update existing policies
*/

-- Create table_groups table
CREATE TABLE IF NOT EXISTS table_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  prefix text NOT NULL,
  color text DEFAULT '#FF6B35',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE table_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Table groups are viewable by tenant members"
  ON table_groups FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage table groups"
  ON table_groups FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Add new columns to restaurant_tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_tables' AND column_name = 'group_id'
  ) THEN
    ALTER TABLE restaurant_tables ADD COLUMN group_id uuid REFERENCES table_groups(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'restaurant_tables' AND column_name = 'session_start'
  ) THEN
    ALTER TABLE restaurant_tables ADD COLUMN session_start timestamptz;
  END IF;
END $$;

-- Create index
CREATE INDEX IF NOT EXISTS idx_tables_group_id ON restaurant_tables(group_id);
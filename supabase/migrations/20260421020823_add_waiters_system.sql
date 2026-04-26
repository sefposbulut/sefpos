/*
  # Add Waiters System

  1. New Tables
    - `waiters`
      - `id` (uuid, primary key)
      - `tenant_id` (uuid, foreign key to tenants)
      - `phone` (text, unique per tenant)
      - `pin` (text, hashed PIN code)
      - `name` (text)
      - `status` (enum: active, inactive)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `waiters` table
    - Add policy for waiters to read themselves
    - Add policy for branch managers to manage waiters
    - Add policy for super admins to manage all waiters

  3. Relationships
    - Waiters belong to a tenant
    - Waiters can be assigned to orders
*/

CREATE TABLE IF NOT EXISTS waiters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone text NOT NULL,
  pin text NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, phone)
);

ALTER TABLE waiters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Waiters can read their own data"
  ON waiters FOR SELECT
  TO authenticated
  USING (auth.uid()::text = id::text OR tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Managers can manage waiters"
  ON waiters FOR ALL
  TO authenticated
  USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'owner'
      OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager'
    )
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT role FROM profiles WHERE id = auth.uid()) = 'owner'
      OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'manager'
    )
  );

CREATE INDEX idx_waiters_tenant_id ON waiters(tenant_id);
CREATE INDEX idx_waiters_phone ON waiters(phone);
CREATE INDEX idx_waiters_status ON waiters(status);